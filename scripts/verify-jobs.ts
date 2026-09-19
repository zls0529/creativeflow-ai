import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {db} from '../lib/database/client';
import {demoBrief} from '../lib/demo';
import {createJob,getJob,cancelJob,retryJob,claimJob,recoverStaleJobs,JOB_LEASE_MS} from '../lib/jobs/store';
import {workOnce} from '../lib/jobs/executor';
import {getProviders} from '../lib/providers';
const file='docs/jobs-verification.json';
async function create(name:string){return createCampaign({...demoBrief,name:'Job verification — '+name});}
async function main(){
 if(['LLM_PROVIDER','IMAGE_PROVIDER','VISION_PROVIDER'].some(k=>process.env[k]!=='mock')||!process.env.DATABASE_URL?.includes('jobs-verification'))throw new Error('Use mock providers and the isolated jobs-verification database.');
 process.env.MAX_REFINEMENTS='0';
 const mode=process.argv[2];
 if(mode==='seed'){
  const campaign=await create('normal generation');
  const response=await fetch('http://127.0.0.1:3000/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:campaign.id,requestKey:randomUUID()})});assert.equal(response.status,202);const job=await response.json();assert.equal(job.status,'queued');
  await writeFile(file,JSON.stringify({A:{jobId:job.id,campaignId:campaign.id,initialStatus:job.status},paidCalls:0,realImageJobs:0},null,2));console.log('Normal job queued:',job.id);return;
 }
 if(mode==='run'){
  const p=getProviders(),generate=p.image.generate.bind(p.image);p.image.generate=async r=>{await delay(6000);return generate(r);};await workOnce({providers:p});console.log('Slow mock worker completed one job.');return;
 }
 const report=JSON.parse(await readFile(file,'utf8'));const a=await getJob(report.A.jobId);assert.equal(a.status,'completed');report.A={...report.A,finalStatus:a.status,attempts:a.attempts.length,assets:(await getCampaign(a.campaignId))!.assets.length};
 const c=await create('cancel, retry and duplicate prevention'),input={campaignId:c.id,requestKey:randomUUID()},job=await createJob(input);assert.equal((await createJob(input)).id,job.id);await assert.rejects(createJob({...input,requestKey:randomUUID()}));report.B={sameRequestReturnsSameJob:true,conflictingRequestRejected:true};
 const p=getProviders(),generate=p.image.generate.bind(p.image);let reached!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});let images=0,visions=0;
 p.image.generate=async r=>{images++;reached();await gate;return generate(r);};p.vision.evaluate=async()=>{visions++;throw new Error('Vision must not run after cancellation.');};
 const working=workOnce({providers:p});await started;assert.equal((await cancelJob(job.id)).status,'cancel_requested');release();await working;assert.equal((await getJob(job.id)).status,'cancelled');assert.equal(visions,0);report.C={status:'cancelled',imagesSaved:images,subsequentVisionCalls:visions};
 await retryJob(job.id,1);await workOnce();const retried=await getJob(job.id);assert.equal(retried.status,'completed');assert.equal(retried.attempts[0].status,'cancelled');report.E={status:retried.status,previousAttempt:retried.attempts[0].status,currentAttempt:retried.attempt};
 const d=await create('unavailable ComfyUI'),blocked=await createJob({campaignId:d.id,requestKey:randomUUID()});process.env.IMAGE_PROVIDER='comfyui';process.env.COMFYUI_URL='http://127.0.0.1:1';process.env.COMFYUI_CHECKPOINT_NAME='not-needed';await workOnce();process.env.IMAGE_PROVIDER='mock';const failure=await getJob(blocked.id);assert.equal(failure.failureCode,'preflight_blocked');assert.equal((await getCampaign(d.id))!.assets.length,0);report.D={status:failure.status,reason:failure.failureCode,agentRuns:(await getCampaign(d.id))!.runs.length};
 const f=await create('interrupted recovery'),stale=await createJob({campaignId:f.id,requestKey:randomUUID()}),now=new Date();await claimJob('verification-stopped-worker',now);await recoverStaleJobs(new Date(+now+JOB_LEASE_MS+1));const interrupted=await getJob(stale.id);assert.equal(interrupted.failureCode,'interrupted');await retryJob(stale.id,1);await workOnce();const recovered=await getJob(stale.id);assert.equal(recovered.status,'completed');assert.equal(recovered.attempts[0].failureCode,'interrupted');report.F={status:recovered.status,priorFailure:recovered.attempts[0].failureCode,currentAttempt:recovered.attempt};
 report.checkedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('Isolated job verification failed. No live providers were requested.');process.exitCode=1;}).finally(()=>db.$disconnect());
