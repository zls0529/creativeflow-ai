import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {creativeModes,routeCreative,compatibleWorkflows,creativeIntent} from '../lib/workflows/creative-modes';
import {freezeRouting} from '../lib/workflows/routing';
import {creativeSelectionSchema,type CreativeMode} from '../types/creative-mode';
import {checkReadiness} from '../lib/readiness';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {createJob,cancelJob} from '../lib/jobs/store';
import {db} from '../lib/database/client';
import {demoBrief} from '../lib/demo';
import {analyseBrand,directCampaign,engineerPrompt} from '../lib/agents/creative';
import {assetSpecs} from '../types/campaign';
import type {LLMProvider,StructuredRequest} from '../lib/providers/llm/base';
import {ComfyUIProvider} from '../lib/providers/image/comfyui';
import type {ImageRequest} from '../lib/providers/image/base';
import {runCampaign} from '../lib/agents/orchestrator';
import {executionContext} from '../lib/jobs/context';
import {MockLLMProvider} from '../lib/providers/llm/mock';
const ids:string[]=[];
after(async()=>{await db.campaign.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
const product={id:'product-fixture',role:'product'},pose={id:'pose-fixture',role:'pose'};
const route=(mode:CreativeMode,references:{id:string;role:string}[]=[])=>routeCreative({selection:{mode},placement:'hero',references});
test('six complete mode definitions preserve experimental and legacy evidence',()=>{
 assert.equal(creativeModes.length,6);assert.equal(new Set(creativeModes.map(m=>m.id)).size,6);
 for(const m of creativeModes){assert.ok(m.intent&&m.description&&m.support&&m.evidence&&m.required.length);assert.equal(creativeIntent({mode:m.id})?.mode,m.id);}
 assert.match(creativeModes[0].evidence,/3\/3.*limited exact SKU/);assert.match(creativeModes[2].support,/no dedicated/);
});
test('Commercial Poster and Product Hero require one product and honor placement contracts',()=>{
 for(const [mode,id] of [['commercial_poster','commercial_poster_v1'],['product_hero','product_hero_v1']] as const){assert.equal(route(mode,[product]).selected.id,id);assert.equal(route(mode,[product]).blockers.length,0);assert.match(route(mode).blockers.join(' '),/product reference/);}
 const unsupported=routeCreative({selection:{mode:'commercial_poster'},placement:'story',references:[product]});assert.ok(unsupported.blockers.length);assert.equal(unsupported.selected.id,'commercial_poster_v1');
});
test('Sports with and without pose, Social Fast and Lifestyle route deterministically',()=>{
 assert.equal(route('sports',[pose]).providerMode,'sports_pose');assert.equal(route('sports').providerMode,'sports');assert.equal(route('social_fast').providerMode,'basic');assert.equal(route('lifestyle').providerMode,'quality');assert.match(route('lifestyle').warnings.join(' '),/No dedicated Lifestyle/);
 const unavailable=routeCreative({selection:{mode:'sports'},placement:'hero',references:[pose],available:false,unavailableReason:'Missing ControlNet'});assert.equal(unavailable.providerMode,'sports_pose');assert.match(unavailable.blockers.join(' '),/Missing ControlNet/);assert.match(unavailable.fallbackRecommendation!,/No automatic fallback/);
});
test('Custom overrides require a reason, registered executable workflow and compatible inputs',()=>{
 assert.equal(creativeSelectionSchema.safeParse({mode:'custom'}).success,false);
 const override={workflowId:'legacy_quality_v1',version:'1.0.0' as const,reason:'Compare the quality workflow'};
 const r=routeCreative({selection:{mode:'social_fast',override},placement:'hero',references:[]});assert.equal(r.recommended.id,'legacy_basic_v1');assert.equal(r.selected.id,override.workflowId);assert.equal(r.override?.reason,override.reason);
 assert.equal(freezeRouting({creative:{mode:'social_fast',override},uploads:[],assets:[]},{workflowOverride:null})?.[0].selected.id,'legacy_basic_v1');
 assert.ok(routeCreative({selection:{mode:'custom',override:{...override,workflowId:'unknown_workflow'}},placement:'hero',references:[]}).blockers.length);
 assert.ok(!compatibleWorkflows('story',[product]).some(w=>w.id==='commercial_poster_v1'));assert.ok(!compatibleWorkflows('hero',[]).some(w=>w.id==='product_hero_v1'));
});
test('frozen routing preserves legacy auto and narrows posters to supported Hero only',()=>{
 const c={uploads:[product],assets:[]};assert.equal(freezeRouting(c,{}),undefined);const frozen=freezeRouting({...c,creative:{mode:'commercial_poster'}},{});assert.equal(frozen?.length,1);assert.equal(frozen?.[0].placement,'hero');assert.equal(freezeRouting({...c,creative:{mode:'product_hero'}},{})?.length,5);
});
test('readiness rejects missing product before discovery; selected mock legacy needs no external nodes',async()=>{
 const created=await createCampaign({...demoBrief,name:'TEST-MODES-'+randomUUID(),creative:{mode:'product_hero'}});ids.push(created.id);const c=(await getCampaign(created.id))!;
 let network=0;const fetcher:typeof fetch=async()=>{network++;throw new Error('No network allowed');};
 const blocked=await checkReadiness({campaign:c},{env:{LLM_PROVIDER:'mock',IMAGE_PROVIDER:'mock',VISION_PROVIDER:'mock'},fetch:fetcher});assert.equal(blocked.canGenerate,false);assert.match(JSON.stringify(blocked),/product reference/);assert.equal(network,0);
 const ready=await checkReadiness({campaign:{...c,creative:{mode:'social_fast'}}},{env:{LLM_PROVIDER:'mock',IMAGE_PROVIDER:'mock',VISION_PROVIDER:'mock'},fetch:fetcher});assert.equal(ready.canGenerate,true);assert.ok(!ready.items.some(i=>/OpenPose/.test(i.name)));assert.equal(network,0);
});
test('Director and Prompt Engineer receive concise mode intent without an additional agent call',async()=>{
 const contexts:unknown[]=[];const llm:LLMProvider={name:'fixture',async generate<T>(r:StructuredRequest<T>){contexts.push(r.context);return r.schema.parse(r.mock());}};
 const brief={...demoBrief,creative:{mode:'commercial_poster' as const}},brand=await analyseBrand(llm,brief,[]),direction=await directCampaign(llm,brief,brand);await engineerPrompt(llm,brand,direction,assetSpecs[0],undefined,brief.creative);
 assert.equal(contexts.length,3);for(const context of contexts.slice(1))assert.match(JSON.stringify(context),/copy-safe space/);
});
test('job snapshots ignore caller routing, remain idempotent and do not backfill historical campaigns',async()=>{
 const old=await createCampaign({...demoBrief,name:'TEST-MODES-OLD-'+randomUUID()});ids.push(old.id);assert.equal((await getCampaign(old.id))?.creative,undefined);
 const current=await createCampaign({...demoBrief,name:'TEST-MODES-'+randomUUID(),creative:{mode:'sports'}});ids.push(current.id);
 const input={campaignId:current.id,requestKey:randomUUID(),routing:[route('social_fast')]};const job=await createJob(input);try{assert.equal(job.routing?.[0].providerMode,'sports');assert.equal((await createJob(input)).id,job.id);const stored=await db.executionJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(JSON.parse(stored.payload).routing.length,5);assert.equal(await db.generation.count({where:{asset:{campaignId:current.id}}}),0);}finally{await cancelJob(job.id);}
});
test('frozen legacy choice overrides global auto and refinement preferences without generation',async()=>{
 const provider=new ComfyUIProvider({COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'offline.safetensors',COMFYUI_WORKFLOW_MODE:'auto'});
 const request={forcedWorkflow:'basic',qualityPreference:{mode:'sports',reason:'Prior low score'},references:[],prompt:{subject:'athlete'},direction:{}} as unknown as ImageRequest;
 assert.equal(provider.workflow(request).mode,'basic');assert.equal((await provider.resolveWorkflow(request)).mode,'basic');assert.equal(provider.readinessRequirements(request).pose,false);
});
test('poster strategy preparation creates only Hero prompt and never calls image or Vision',async()=>{
 const c=await createCampaign({...demoBrief,name:'TEST-MODES-PREP-'+randomUUID(),creative:{mode:'commercial_poster'}});ids.push(c.id);
 const job=await createJob({campaignId:c.id,requestKey:randomUUID()});
 try{await executionContext.run({jobId:job.id,attempt:1,routing:job.routing,checkpoint:async()=>{},fence:async()=>{}},()=>runCampaign(c.id,()=>{},undefined,{llm:new MockLLMProvider(),image:{name:'fixture',generate:async()=>{throw new Error('Images forbidden');}},vision:{name:'fixture',evaluate:async()=>{throw new Error('Vision forbidden');}}},undefined,true));
 const prepared=(await getCampaign(c.id))!;assert.deepEqual(prepared.assets.map(a=>a.kind),['hero']);assert.ok(prepared.direction&&prepared.brandProfile);assert.equal(prepared.assets[0].generations.length,0);
 const frozen=route('sports',[pose]);const report=await checkReadiness({campaign:prepared,routing:[frozen]},{env:{},fetch:async()=>{throw new Error('Network forbidden');}});assert.equal(report.canGenerate,false);assert.match(JSON.stringify(report),/reference recorded when the job/);
 }finally{await cancelJob(job.id);}
});
