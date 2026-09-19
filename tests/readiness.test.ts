import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {checkReadiness,readinessRequests,ReadinessBlockedError,safeReadinessText} from '../lib/readiness';
import {POST} from '../app/api/readiness/route';
import {storage} from '../lib/storage';
import {openPoseModel} from '../lib/providers/image/pose';
import {defaultAdapter,defaultEncoder} from '../lib/providers/image/reference-workflow';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {db} from '../lib/database/client';
import {runCampaign} from '../lib/agents/orchestrator';
import {demoBrief} from '../lib/demo';
import type {ImageRequest} from '../lib/providers/image/base';
import type {CampaignView} from '../types/campaign';
const env={LLM_PROVIDER:'openai',VISION_PROVIDER:'openai',OPENAI_API_KEY:'fake-secret-for-offline-tests',IMAGE_PROVIDER:'comfyui',COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture.safetensors',COMFYUI_WORKFLOW_MODE:'basic'};
const request={prompt:{subject:'One athlete running',composition:'Full body',environment:'Street',style:'Photo',negative_prompt:'blur'},direction:{},kind:'hero',references:[]} as unknown as ImageRequest;
type Catalog=Record<string,{input:{required:Record<string,unknown[]>}}>;
async function catalog():Promise<Catalog>{
 const result:Catalog={};for(const file of ['basic_text2img_api','human_quality_api','sports_api','sports_pose_api','reference_conditioning_api']){
  const graph=JSON.parse(await readFile('comfyui/workflows/'+file+'.json','utf8')) as Record<string,{class_type:string}>;
  for(const n of Object.values(graph))result[n.class_type]={input:{required:{}}};
 }
 for(const [node,key,values] of [['CheckpointLoaderSimple','ckpt_name',[env.COMFYUI_CHECKPOINT_NAME]],['ControlNetLoader','control_net_name',[openPoseModel]],['IPAdapterModelLoader','ipadapter_file',[defaultAdapter]],['CLIPVisionLoader','clip_name',[defaultEncoder]],['IPAdapterAdvanced','weight_type',['linear','style transfer']],['UltralyticsDetectorProvider','model_name',['bbox/face_yolov8m.pt']]] as const)result[node].input.required[key]=[[...values]];
 return result;
}
function fetchCatalog(c:Catalog):typeof fetch{return async(url,init)=>{assert.match(String(url),/\/object_info$/);assert.equal(init?.method,'GET');return Response.json(c);};}
async function check(extra:Record<string,string|undefined>={},r=request,c?:Catalog){return checkReadiness({requests:[r]},{env:{...env,...extra},fetch:fetchCatalog(c??await catalog())});}
async function withReference(role:'pose'|'product',work:(r:ImageRequest)=>Promise<void>){const id=randomUUID();await storage.put(id,await sharp({create:{width:128,height:128,channels:3,background:'white'}}).png().toBuffer());try{await work({...request,references:[{id,role,mime:'image/png'}]});}finally{await storage.remove(id);}}
test('ready discovery validates graph while OpenAI is only configured; unused dependencies are not required',async()=>{
 const report=await check();assert.equal(report.canGenerate,true);assert.equal(report.items.find(i=>i.id==='LLM')?.status,'configured');assert.equal(report.items.find(i=>i.id==='Vision')?.status,'configured');assert.equal(report.items.find(i=>i.id==='checkpoint')?.status,'ready');
 for(const id of ['pose','face','adapter','refs'])assert.equal(report.items.find(i=>i.id===id)?.status,'not_required');
 assert.ok(report.items.some(i=>i.severity==='warning'));assert.ok(!JSON.stringify(report).includes(env.OPENAI_API_KEY));
});
test('campaign planning includes missing placements and keeps a known isolated product request basic',async()=>{
 const campaign={...demoBrief,colours:[],uploads:[],assets:[{id:'hero',kind:'hero',width:1024,height:768,status:'ready',prompt:request.prompt,generations:[]}]} as unknown as CampaignView;
 const plan=readinessRequests({campaign});assert.equal(plan.requests.length,5);assert.equal(plan.provisional,true);
 const selected=readinessRequests({campaign,assetId:'hero'});assert.equal(selected.requests.length,1);assert.equal(selected.provisional,false);
 const c=await catalog();delete c.ControlNetLoader;delete c.IPAdapterModelLoader;delete c.FaceDetailer;
 const product=await check({COMFYUI_WORKFLOW_MODE:'auto'},{...request,kind:'product',prompt:{...request.prompt,subject:'Isolated shoe',composition:'Product only'}},c);assert.equal(product.canGenerate,true);assert.deepEqual(product.workflowModes,['basic']);
});
test('offline, timeout, malformed metadata and missing configuration block safely',async()=>{
 for(const fetcher of [async()=>{throw new Error('private upstream failure');},async()=>Response.json({}),async()=>new Response('not-json')]){const report=await checkReadiness({requests:[request]},{env,fetch:fetcher});assert.equal(report.canGenerate,false);assert.equal(report.items.find(i=>i.id==='comfy')?.status,'unavailable');assert.ok(!JSON.stringify(report).includes('private upstream'));}
 const timed=await checkReadiness({requests:[request]},{env,timeoutMs:1,fetch:async(_url,init)=>{await new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new Error('timeout')));setTimeout(()=>reject(new Error('fallback')),30);});throw new Error();}});assert.match(timed.items.find(i=>i.id==='comfy')!.explanation,/timed out/);
 for(const config of [{COMFYUI_URL:''},{COMFYUI_CHECKPOINT_NAME:''},{OPENAI_API_KEY:''},{LLM_PROVIDER:'unsupported'},{VISION_MODEL:'text-only'},{IMAGE_PROVIDER:'unsupported'}])assert.equal((await check(config)).canGenerate,false);
});
test('unrelated optional-only ComfyUI nodes do not invalidate discovery',async()=>{
 const c=await catalog();const report=await checkReadiness({requests:[request]},{env,fetch:async()=>Response.json({...c,OptionalOnly:{input:{optional:{value:['STRING']}}}})});assert.equal(report.canGenerate,true);
});
test('missing checkpoint and face detector block only workflows that use them',async()=>{
 const c=await catalog();c.CheckpointLoaderSimple.input.required.ckpt_name=[[]];assert.equal((await check({},request,c)).items.find(i=>i.id==='checkpoint')?.status,'unavailable');
 const face=await catalog();delete face.FaceDetailer;assert.equal((await check({},request,face)).canGenerate,true);assert.equal((await check({COMFYUI_WORKFLOW_MODE:'sports'},request,face)).canGenerate,false);assert.equal((await check({COMFYUI_WORKFLOW_MODE:'sports',COMFYUI_SPORTS_FACE_DETAIL:'false'},request,face)).canGenerate,true);
 const detector=await catalog();delete detector.UltralyticsDetectorProvider.input.required.model_name;assert.equal((await check({COMFYUI_WORKFLOW_MODE:'sports'},request,detector)).items.find(i=>i.id==='face')?.status,'unavailable');
});
test('sports has no pose requirement; explicit sports_pose requires a stored reference',async()=>{
 const sports=await check({COMFYUI_WORKFLOW_MODE:'sports'});assert.equal(sports.canGenerate,true);assert.equal(sports.items.find(i=>i.id==='pose')?.status,'not_required');
 const pose=await check({COMFYUI_WORKFLOW_MODE:'sports_pose'});assert.equal(pose.canGenerate,false);assert.equal(pose.items.find(i=>i.id==='pose')?.status,'unavailable');assert.match(JSON.stringify(pose),/pose reference/);
});
test('auto sports_pose recognizes installed ControlNet and blocks a missing model',async()=>withReference('pose',async r=>{
 const ready=await check({COMFYUI_WORKFLOW_MODE:'auto'},r);assert.equal(ready.canGenerate,true);assert.deepEqual(ready.workflowModes,['sports_pose']);assert.equal(ready.items.find(i=>i.id==='pose')?.status,'ready');
 const c=await catalog();c.ControlNetLoader.input.required.control_net_name=[[]];const blocked=await check({COMFYUI_WORKFLOW_MODE:'sports_pose'},r,c);assert.equal(blocked.canGenerate,false);assert.equal(blocked.items.find(i=>i.id==='pose')?.status,'unavailable');
}));
test('reference conditioning requires both adapter and encoder; unselected dependencies are ignored',async()=>withReference('product',async r=>{
 assert.equal((await check({},r)).items.find(i=>i.id==='adapter')?.status,'ready');
 for(const node of ['IPAdapterModelLoader','CLIPVisionLoader']){const c=await catalog();delete c[node];assert.equal((await check({},r,c)).canGenerate,false);assert.equal((await check({},request,c)).canGenerate,true);}
}));
test('mock and brand analysis checks make no network calls; optional warnings do not block',async()=>{
 const fetcher:typeof fetch=async()=>{throw new Error('Network must not be called');};
 const mock=await checkReadiness({}, {env:{},fetch:fetcher});assert.equal(mock.canGenerate,true);
 const analysis=await checkReadiness({purpose:'brand_analysis'},{env:{LLM_PROVIDER:'mock'},fetch:fetcher});assert.equal(analysis.canGenerate,true);assert.equal(analysis.items.find(i=>i.id==='brand')?.severity,'warning');
 assert.equal((await checkReadiness({purpose:'brand_analysis'},{env:{LLM_PROVIDER:'openai'},fetch:fetcher})).canGenerate,false);
});
test('missing repository template is a blocking result, not an endpoint crash',async()=>{
 const c=await catalog(),original=process.cwd(),directory=await mkdtemp(path.join(tmpdir(),'creativeflow-readiness-'));
 try{process.chdir(directory);const report=await check({},request,c);assert.equal(report.canGenerate,false);assert.match(JSON.stringify(report),/template is missing/);assert.ok(!JSON.stringify(report).includes(directory));}finally{process.chdir(original);await rm(directory,{recursive:true});}
});
test('readiness endpoint sanitizes secrets, paths and arbitrary provider values',async()=>{
 const previous={...process.env};try{
  Object.assign(process.env,{LLM_PROVIDER:'openai',OPENAI_API_KEY:env.OPENAI_API_KEY,OPENAI_MODEL:'C:\\private\\'+env.OPENAI_API_KEY,VISION_PROVIDER:'mock',IMAGE_PROVIDER:'unsupported '+env.OPENAI_API_KEY});
  const response=await POST(new Request('http://127.0.0.1/api/readiness',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text();assert.ok(!body.includes(env.OPENAI_API_KEY));assert.ok(!body.includes('private'));assert.ok(!body.includes('C:'));
  assert.ok(!safeReadinessText('error '+env.OPENAI_API_KEY+' at E:\\private\\file',env).includes('private'));
 }finally{process.env=previous;}
});
test('server preflight blocks before agents, version reservations or history updates',async()=>{
 const previous={...process.env},fetcher=global.fetch;const campaign=await createCampaign({...demoBrief,name:'TEST-READINESS-BLOCKED'});
 try{Object.assign(process.env,{...env,LLM_PROVIDER:'mock',VISION_PROVIDER:'mock'});let requests=0;global.fetch=async(url)=>{requests++;assert.match(String(url),/object_info$/);throw new Error('offline');};
  await assert.rejects(runCampaign(campaign.id),ReadinessBlockedError);assert.equal(requests,1);const saved=(await getCampaign(campaign.id))!;assert.equal(saved.assets.length,0);assert.equal(saved.runs.length,0);assert.equal(saved.status,campaign.status);assert.equal((await db.campaign.findUniqueOrThrow({where:{id:campaign.id}})).lockAt,null);
 }finally{process.env=previous;global.fetch=fetcher;await db.campaign.delete({where:{id:campaign.id}});}
});
after(async()=>{await db.$disconnect();});
