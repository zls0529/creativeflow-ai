import {test,beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/database/client';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {createJob,getJob,listJobs,cancelJob,retryJob,claimJob,heartbeat,recoverStaleJobs,finishJob,JOB_LEASE_MS} from '../lib/jobs/store';
import {workOnce} from '../lib/jobs/executor';
import {withCampaignLock} from '../lib/agents/orchestrator';
import {JobConflictError} from '../lib/jobs/errors';
import {getProviders} from '../lib/providers';
import {demoBrief} from '../lib/demo';
import {POST as createAPI} from '../app/api/jobs/route';
import {GET as readAPI} from '../app/api/jobs/[id]/route';
import {POST as retryAPI} from '../app/api/jobs/[id]/retry/route';
const original={...process.env},originalFetch=global.fetch,ids:string[]=[];
beforeEach(()=>{Object.assign(process.env,{LLM_PROVIDER:'mock',IMAGE_PROVIDER:'mock',VISION_PROVIDER:'mock',MAX_REFINEMENTS:'0',CRITIC_THRESHOLD:'80'});global.fetch=async()=>{throw new Error('Tests must not call external services.');};});
afterEach(()=>{process.env={...original};global.fetch=originalFetch;});
after(async()=>{await db.campaign.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
async function fixture(){const c=await createCampaign({...demoBrief,name:'TEST-JOBS-'+randomUUID().slice(0,8)});ids.push(c.id);return c;}
async function queued(){const c=await fixture();return createJob({campaignId:c.id,requestKey:randomUUID()});}
function latch(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};}
test('creation is persistent, request-key idempotent, and conflicting campaign operations are blocked',async()=>{
 const c=await fixture(),input={campaignId:c.id,requestKey:randomUUID()};const a=await createJob(input),b=await createJob(input);assert.equal(a.id,b.id);assert.equal((await listJobs(c.id)).length,1);assert.equal(a.status,'queued');
 await assert.rejects(createJob({...input,requestKey:randomUUID()}),JobConflictError);await assert.rejects(withCampaignLock(c.id,async()=>{}),/already running/);await cancelJob(a.id);
});
test('concurrent submissions and competing workers claim only one active operation',async()=>{
 const c=await fixture();const results=await Promise.allSettled([createJob({campaignId:c.id,requestKey:randomUUID()}),createJob({campaignId:c.id,requestKey:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const job=(await listJobs(c.id))[0],owner=randomUUID();assert.ok(await claimJob(owner));assert.equal(await claimJob(randomUUID()),null);await finishJob(job.id,owner,'failed','Test claim released.');
});
test('queued → running → completed persists stages and low quality is not provider failure',async()=>{
 const job=await queued();const providers=getProviders(),generate=providers.image.generate.bind(providers.image);providers.image.generate=async r=>{assert.equal((await getJob(job.id)).status,'running');return generate(r);};
 await workOnce({providers});const saved=await getJob(job.id),c=(await getCampaign(job.campaignId))!;assert.equal(saved.status,'completed');assert.equal(saved.attempts[0].status,'completed');assert.ok(saved.events.some(e=>e.stage==='Vision Review'));assert.equal(c.assets.length,5);assert.ok(c.assets.every(a=>a.generations.length===1&&a.generations[0].imageUrl));assert.ok(c.assets.every(a=>a.status==='needs_review'));assert.ok(c.assets.every(a=>a.generations[0].jobId===job.id));
});
test('provider failure preserves safe attempt history and retries reuse saved strategy',async()=>{
 const job=await queued(),providers=getProviders();providers.image.generate=async()=>{throw new Error('ComfyUI unavailable');};await workOnce({providers});
 const failed=await getJob(job.id);assert.equal(failed.status,'failed');assert.match(failed.failure!,/ComfyUI unavailable/);const profile=(await getCampaign(job.campaignId))!.brandProfile;assert.ok(profile);
 await retryJob(job.id,1);await assert.rejects(retryJob(job.id,1),JobConflictError);await workOnce({providers:getProviders()});const completed=await getJob(job.id);assert.equal(completed.status,'completed');assert.equal(completed.attempt,2);assert.equal(completed.retryCount,1);assert.equal(completed.attempts[0].status,'failed');assert.match(completed.attempts[0].failure!,/ComfyUI unavailable/);assert.deepEqual((await getCampaign(job.campaignId))!.brandProfile,profile);
});
test('preflight failure performs no agent or version work',async()=>{
 const job=await queued();await workOnce({preflight:async()=>({checkedAt:new Date().toISOString(),canGenerate:false,provisional:false,workflowModes:[],items:[{id:'comfy',name:'ComfyUI',status:'unavailable',severity:'blocking',explanation:'ComfyUI unavailable'}]})});
 const saved=await getJob(job.id);assert.equal(saved.status,'failed');assert.equal(saved.failureCode,'preflight_blocked');const c=(await getCampaign(job.campaignId))!;assert.equal(c.runs.length,0);assert.equal(c.assets.length,0);
});
test('queued cancellation starts no work and retry creates a new attempt',async()=>{
 const job=await queued();assert.equal((await cancelJob(job.id)).status,'cancelled');assert.equal(await claimJob(randomUUID()),null);await retryJob(job.id,1);await workOnce();const saved=await getJob(job.id);assert.equal(saved.status,'completed');assert.equal(saved.attempts[0].status,'cancelled');assert.equal(saved.attempts[1].status,'completed');
});
test('cancellation in flight remains requested until output is saved, then stops Vision and subsequent assets',async()=>{
 const job=await queued(),entered=latch(),release=latch(),p=getProviders();let images=0,visions=0;const generate=p.image.generate.bind(p.image),evaluate=p.vision.evaluate.bind(p.vision);
 p.image.generate=async r=>{images++;entered.release();await release.promise;return generate(r);};p.vision.evaluate=async r=>{visions++;return evaluate(r);};
 const running=workOnce({providers:p});await entered.promise;assert.equal((await cancelJob(job.id)).status,'cancel_requested');assert.equal((await getJob(job.id)).status,'cancel_requested');release.release();await running;
 assert.equal((await getJob(job.id)).status,'cancelled');assert.equal(images,1);assert.equal(visions,0);const c=(await getCampaign(job.campaignId))!;assert.ok(c.assets[0].generations[0].imageUrl);assert.equal(c.assets[0].generations[0].evaluation,null);
 await retryJob(job.id,1);const fresh=getProviders(),gen=fresh.image.generate.bind(fresh.image);let retryImages=0;fresh.image.generate=async r=>{retryImages++;return gen(r);};await workOnce({providers:fresh});assert.equal(retryImages,4);assert.equal((await getCampaign(job.campaignId))!.assets[0].generations.length,1);
});
test('Vision failure retry evaluates stored image without duplicating its successful generation',async()=>{
 const job=await queued(),p=getProviders();p.vision.evaluate=async()=>{throw new Error('Vision evaluation timed out');};await workOnce({providers:p});const before=(await getCampaign(job.campaignId))!.assets[0].generations[0];assert.equal(before.status,'evaluation_failed');
 await retryJob(job.id,1);await workOnce({providers:getProviders()});const after=(await getCampaign(job.campaignId))!.assets[0].generations;assert.equal(after.length,1);assert.equal(after[0].id,before.id);assert.equal(after[0].imageUrl,before.imageUrl);assert.ok(after[0].evaluation);
});
test('quality refinement follows existing policy and finishes successfully with review required',async()=>{
 process.env.MAX_REFINEMENTS='1';process.env.CRITIC_THRESHOLD='100';const job=await queued();await workOnce();assert.equal((await getJob(job.id)).status,'completed');const c=(await getCampaign(job.campaignId))!;assert.ok(c.assets.every(a=>a.generations.length===2));assert.ok(c.assets.every(a=>a.status==='needs_review'));assert.ok((await getJob(job.id)).events.some(e=>e.stage==='Refinement'));
});
test('heartbeat extends ownership, stale recovery is explicit and old owners cannot complete',async()=>{
 const job=await queued(),owner=randomUUID(),now=new Date();await claimJob(owner,now);assert.equal(await heartbeat(job.id,'foreign',new Date(+now+100)),false);assert.equal(await heartbeat(job.id,owner,new Date(+now+1000)),true);assert.equal(await recoverStaleJobs(new Date(+now+JOB_LEASE_MS)),0);assert.equal(await recoverStaleJobs(new Date(+now+JOB_LEASE_MS+1001)),1);
 const saved=await getJob(job.id);assert.equal(saved.status,'failed');assert.equal(saved.failureCode,'interrupted');assert.equal(await finishJob(job.id,owner,'completed','Stale worker result'),false);assert.equal(await heartbeat(job.id,owner),false);assert.equal((await db.campaign.findUniqueOrThrow({where:{id:job.campaignId}})).activeJobId,null);await retryJob(job.id,1);await workOnce();assert.equal((await getJob(job.id)).status,'completed');assert.equal((await getJob(job.id)).attempts[0].failureCode,'interrupted');
});
test('HTTP creation returns a job immediately and refresh reads the same durable status',async()=>{
 const c=await fixture();const response=await createAPI(new Request('http://127.0.0.1/api/jobs',{method:'POST',body:JSON.stringify({campaignId:c.id,requestKey:randomUUID()})}));assert.equal(response.status,202);const job=await response.json();assert.equal(job.status,'queued');assert.equal((await getCampaign(c.id))!.runs.length,0);
 const refreshed=await readAPI(new Request('http://127.0.0.1/api/jobs/'+job.id),{params:Promise.resolve({id:job.id})});assert.equal((await refreshed.json()).id,job.id);await workOnce();const final=await readAPI(new Request('http://127.0.0.1/api/jobs/'+job.id),{params:Promise.resolve({id:job.id})});assert.equal((await final.json()).status,'completed');
 const invalid=await retryAPI(new Request('http://127.0.0.1/api/jobs/'+job.id+'/retry',{method:'POST',body:JSON.stringify({attempt:1})}),{params:Promise.resolve({id:job.id})});assert.equal(invalid.status,409);
});
test('job failures and API errors do not expose credentials, paths, environment or ownership',async()=>{
 const secret='fake-private-api-key-123';process.env.OPENAI_API_KEY=secret;const job=await queued(),p=getProviders();p.image.generate=async()=>{throw new Error(secret+' at E:\\private\\credential.txt');};await workOnce({providers:p});const body=JSON.stringify(await getJob(job.id));assert.ok(!body.includes(secret));assert.ok(!body.includes('credential.txt'));assert.ok(!body.includes('owner'));assert.ok(!body.includes('payload'));
 const response=await createAPI(new Request('http://127.0.0.1/api/jobs',{method:'POST',headers:{origin:'https://foreign.example'},body:secret}));assert.equal(response.status,400);assert.ok(!(await response.text()).includes(secret));
});
test('asset regeneration and human refinement are separate jobs; retry resumes only its own output',async()=>{
 const original=await queued();await workOnce();const c=(await getCampaign(original.campaignId))!,asset=c.assets[0],version1=asset.generations[0];
 const regeneration=await createJob({campaignId:c.id,assetId:asset.id,requestKey:randomUUID()}),p=getProviders();p.vision.evaluate=async()=>{throw new Error('Vision failed');};await workOnce({providers:p});assert.equal((await getJob(regeneration.id)).action,'asset_regeneration');
 await retryJob(regeneration.id,1);await workOnce();let saved=(await getCampaign(c.id))!.assets[0];assert.equal(saved.generations.length,2);assert.equal(saved.generations[0].imageUrl,version1.imageUrl);assert.equal(saved.generations[1].jobId,regeneration.id);
 const refinement=await createJob({campaignId:c.id,assetId:asset.id,instruction:'Increase copy-safe space.',requestKey:randomUUID()});await workOnce();assert.equal((await getJob(refinement.id)).action,'prompt_refinement');assert.equal((await getJob(refinement.id)).status,'completed');saved=(await getCampaign(c.id))!.assets[0];assert.equal(saved.generations.length,3);assert.equal(saved.generations[2].jobId,refinement.id);
});
test('old in-flight worker is fenced after recovery and cannot overwrite a successful retry',async()=>{
 const job=await queued(),entered=latch(),release=latch(),p=getProviders(),generate=p.image.generate.bind(p.image);p.image.generate=async r=>{entered.release();await release.promise;return generate(r);};const old=workOnce({providers:p});await entered.promise;
 await recoverStaleJobs(new Date(Date.now()+JOB_LEASE_MS+1));await retryJob(job.id,1);await workOnce();const completed=await getJob(job.id);assert.equal(completed.status,'completed');release.release();await old;const after=await getJob(job.id);assert.equal(after.status,'completed');assert.equal(after.attempt,2);const c=(await getCampaign(job.campaignId))!;assert.equal(c.status,'completed');assert.equal(c.assets[0].generations[0].imageUrl,'');assert.equal(c.assets[0].generations[0].status,'interrupted');
});
