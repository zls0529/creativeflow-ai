import {recordReproducibility} from '@/lib/workflows/reproducibility';
import 'server-only';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {storage} from '@/lib/storage';
import {measure,captureLocal} from '@/lib/usage/capture';
import {sourceImage,rectangleMask,compositeRepair,maskPixels} from '@/lib/repair/masks';
import {repairPrompt} from '@/lib/repair/guidance';
import {repairRequestSchema,type RepairRequest} from '@/types/repair';
import type {ImageRequest} from './base';
import {loadReferences} from './references';
import {applyReferenceWorkflow,defaultAdapter,defaultEncoder} from './reference-workflow';
export type ProviderRepairRequest={repair:RepairRequest;sourceImageUrl:string;sourceVersion:number;image:ImageRequest;maskId?:string};
type Env=Record<string,string|undefined>;
const graphSchema=z.record(z.object({class_type:z.string(),inputs:z.record(z.unknown())}));
type Graph=z.infer<typeof graphSchema>;
function numeric(env:Env,key:string,fallback:number,min:number,max:number,integer=false){const value=Number(env[key]||fallback);if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new Error(`${key} is outside its supported repair range.`);return value;}
export function repairConfiguration(env:Env=process.env){
 let url:URL;try{url=new URL(env.COMFYUI_URL??'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error();}catch{throw new Error('Repair requires a valid server-side COMFYUI_URL.');}
 const checkpoint=env.COMFYUI_CHECKPOINT_NAME?.trim();if(!checkpoint)throw new Error('Repair requires COMFYUI_CHECKPOINT_NAME.');
 return {url,checkpoint,denoise:numeric(env,'COMFYUI_REPAIR_DENOISE',0.4,0.1,0.75),steps:numeric(env,'COMFYUI_REPAIR_STEPS',24,1,60,true),cfg:numeric(env,'COMFYUI_REPAIR_CFG',5.5,0,15),sampler:env.COMFYUI_REPAIR_SAMPLER||'dpmpp_2m',scheduler:env.COMFYUI_REPAIR_SCHEDULER||'karras',face_detector:env.COMFYUI_SPORTS_FACE_DETECTOR||'bbox/face_yolov8m.pt',timeout:numeric(env,'COMFYUI_TIMEOUT_MS',300000,1000,600000,true)};
}
export async function repairGraph(request:RepairRequest,values:Record<string,string|number>,capture?:(template:unknown)=>void){
 const file=request.selection==='auto_face'?'face_repair_api.json':'inpaint_repair_api.json';let template:unknown;
 try{template=JSON.parse(await readFile('comfyui/workflows/'+file,'utf8'));}catch{throw new Error('Repair workflow template is missing or unreadable.');}
 capture?.(template);
 return fillRepairGraph(template,request.selection,values);
}
export function fillRepairGraph(template:unknown,selection:RepairRequest['selection'],values:Record<string,string|number>):Graph{
 const parsed=graphSchema.safeParse(template);if(!parsed.success)throw new Error('Invalid repair workflow template.');const g=parsed.data;
 const expected=selection==='manual'?{'1':'LoadImage','2':'LoadImage','3':'KSampler','4':'CheckpointLoaderSimple','5':'VAEEncode','6':'CLIPTextEncode','7':'CLIPTextEncode','8':'VAEDecode','9':'SaveImage','10':'ImageToMask','11':'SetLatentNoiseMask','12':'ImageCompositeMasked'}:{'1':'LoadImage','4':'CheckpointLoaderSimple','6':'CLIPTextEncode','7':'CLIPTextEncode','20':'UltralyticsDetectorProvider','21':'FaceDetailer','9':'SaveImage','90':'SaveImage','91':'MaskToImage'};
 const fail=()=>{throw new Error('Invalid repair workflow template: source/mask connections are required. No full-image fallback.');};
 if(Object.keys(g).length!==Object.keys(expected).length||Object.entries(expected).some(([id,type])=>g[id]?.class_type!==type))fail();
 const connections=selection==='manual'?[['5','pixels',['1',0]],['11','samples',['5',0]],['11','mask',['10',0]],['10','image',['2',0]],['3','latent_image',['11',0]],['12','destination',['1',0]],['12','source',['8',0]],['12','mask',['10',0]],['9','images',['12',0]]]:[['21','image',['1',0]],['21','bbox_detector',['20',0]],['91','mask',['21',3]],['90','images',['91',0]],['9','images',['21',0]]];
 for(const [id,key,link] of connections)if(JSON.stringify(g[id as string]?.inputs[key as string])!==JSON.stringify(link))fail();
 for(const node of Object.values(g))for(const [key,value] of Object.entries(node.inputs))if(typeof value==='string'&&value.startsWith('{{')){const slot=value.slice(2,-2);if(values[slot]===undefined)fail();node.inputs[key]=values[slot];}
 return g;
}
export function validateRepairNodes(g:Graph,catalog:Record<string,{input?:{required?:Record<string,unknown[]>;optional?:Record<string,unknown[]>}}>) {
 for(const node of Object.values(g)){
  const info=catalog[node.class_type]?.input;if(!info?.required)throw new Error(`Repair unavailable: required node ${node.class_type} is missing.`);
  for(const [key,value] of Object.entries(node.inputs)){
   if(node.class_type==='LoadImage'&&key==='image')continue;
   const options=(info.required[key]??info.optional?.[key])?.[0];if(Array.isArray(options)&&typeof value==='string'&&!options.includes(value))throw new Error(`Repair unavailable: configured ${key} is not installed or supported.`);
  }
 }
}
export async function repairPlan(request:ProviderRepairRequest,env:Env=process.env){
 const repair=repairRequestSchema.parse(request.repair),config=repairConfiguration(env),source=await sourceImage(request.sourceImageUrl);
 const mask=repair.selection==='manual'?await rectangleMask(source.width,source.height,repair.region!):undefined;
 const refs=repair.useProductReference?await loadReferences({...request.image,styleReference:undefined,references:request.image.references.filter(r=>r.role==='product')}):[];
 if(refs.length&&(env.COMFYUI_IPADAPTER_MODEL||defaultAdapter)!==defaultAdapter)throw new Error('Reference repair requires the existing SD1.5 Plus adapter.');
 if(repair.useProductReference&&!refs.some(r=>r.role==='product'))throw new Error('Product-reference repair requested, but no product reference is available.');
 let graph=await repairGraph(repair,{...config,url:config.url.toString(),source:'pending.png',mask:'pending.png',...repairPrompt(repair,request.image.prompt),seed:0});
 let extension:unknown;if(refs.length){try{extension=JSON.parse(await readFile('comfyui/workflows/reference_conditioning_api.json','utf8'));}catch{throw new Error('Reference conditioning template is unavailable.');}graph=applyReferenceWorkflow(graph,extension,refs.map(r=>({...r,image:'pending.png'})),env.COMFYUI_IPADAPTER_MODEL||defaultAdapter,env.COMFYUI_CLIP_VISION_MODEL||defaultEncoder);delete graph['11'].inputs.model;}
 return {config,source,mask,refs,graph,extension};
}
export async function comfyRepair(request:ProviderRepairRequest,env:Env=process.env){
 return measure('comfyui','image','comfyui_repair',env.COMFYUI_CHECKPOINT_NAME??null,async()=>{
  const plan=await repairPlan(request,env),{config,source,refs}=plan;
  const maskId=request.maskId??randomUUID();if(plan.mask)await storage.putRepairMask(maskId,plan.mask);
  captureLocal({workflow:request.repair.selection==='auto_face'?'face_repair':'inpaint_repair',width:source.width,height:source.height,checkpoint:config.checkpoint});
  const signal=AbortSignal.timeout(config.timeout);
  const fetchLocal=async(endpoint:string,init?:RequestInit)=>{try{return await fetch(new URL(config.url.pathname.replace(/\/$/,'')+'/'+endpoint,config.url),{...init,signal,redirect:'error'});}catch{throw new Error(signal.aborted?'ComfyUI repair timed out. Its queued request may still finish; inspect ComfyUI before retrying.':'ComfyUI repair is unreachable.');}};
  const bytes=async(response:Response,limit:number)=>{if(!response.ok||!response.body)throw new Error('ComfyUI repair request failed. Check local service and dependencies.');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit){await reader.cancel();throw new Error();}chunks.push(r.value);}return Buffer.concat(chunks);}catch{throw new Error(signal.aborted?'ComfyUI repair response timed out.':'Invalid or oversized ComfyUI repair response.');}};
  const json=async(endpoint:string,init?:RequestInit)=>{try{return JSON.parse((await bytes(await fetchLocal(endpoint,init),16*1024*1024)).toString());}catch(e){if(e instanceof SyntaxError)throw new Error('Invalid ComfyUI repair response JSON.');throw e;}};
  const catalog=await json('object_info');validateRepairNodes(plan.graph,catalog);
  const upload=async(data:Buffer)=>{const form=new FormData();form.append('image',new Blob([new Uint8Array(data)],{type:'image/png'}),'creativeflow-repair-'+randomUUID()+'.png');form.append('type','input');form.append('overwrite','false');const saved=z.object({name:z.string().regex(/^[a-zA-Z0-9-]+\.png$/),subfolder:z.literal(''),type:z.literal('input')}).safeParse(await json('upload/image',{method:'POST',body:form}));if(!saved.success)throw new Error('Invalid ComfyUI repair upload response.');return saved.data.name;};
  const seed=randomInt(0,2**32),settings={denoise:config.denoise,steps:config.steps,cfg:config.cfg,sampler:config.sampler,scheduler:config.scheduler,seed};
  let usedTemplate:unknown;
  let graph=await repairGraph(request.repair,{...config,url:config.url.toString(),...settings,source:await upload(source.bytes),mask:plan.mask?await upload(plan.mask):'unused.png',...repairPrompt(request.repair,request.image.prompt)},template=>{usedTemplate=template;});
  if(refs.length){const uploaded=[];for(const ref of refs)uploaded.push({...ref,image:await upload(ref.bytes)});graph=applyReferenceWorkflow(graph,plan.extension,uploaded,env.COMFYUI_IPADAPTER_MODEL||defaultAdapter,env.COMFYUI_CLIP_VISION_MODEL||defaultEncoder);delete graph['11'].inputs.model;}
  const reproducibility=recordReproducibility({mode:request.repair.selection==='auto_face'?'face_repair':'inpaint_repair',template:usedTemplate,extension:plan.extension,graph,width:source.width,height:source.height,catalog,references:refs.map(({id,role,strength,weightType,sha256})=>({id,role,strength,weightType,sha256}))});
  const queued=z.object({prompt_id:z.string().regex(/^[a-zA-Z0-9-]+$/),node_errors:z.record(z.unknown()).optional()}).safeParse(await json('prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:randomUUID()})}));
  if(!queued.success||Object.keys(queued.data.node_errors??{}).length)throw new Error('ComfyUI rejected the repair workflow. No full regeneration attempted.');
  const id=queued.data.prompt_id;let outputs:Record<string,unknown>|undefined;
  while(!outputs){const history=await json('history/'+id);if(!history||typeof history!=='object'||Array.isArray(history))throw new Error('Invalid ComfyUI repair history.');const job=history[id];if(job?.status?.status_str==='error')throw new Error('ComfyUI repair failed. Inspect the local server; no fallback attempted.');if(job?.status?.completed){if(!job.outputs||typeof job.outputs!=='object')throw new Error('Invalid repair history: missing image outputs.');outputs=job.outputs;break;}try{await delay(1000,undefined,{signal});}catch{throw new Error('ComfyUI repair timeout; check the queued request before retrying.');}}
  const retrieve=async(node:string)=>{const out=z.object({images:z.array(z.object({filename:z.string().regex(/^[^\\/\x00:]+\.png$/),subfolder:z.string(),type:z.literal('output')})).min(1)}).safeParse(outputs![node]);if(!out.success)throw new Error('Repair completed without the required image or mask output.');const file=out.data.images[0];if(file.subfolder.split(/[\\/]/).includes('..')||/[:\x00]|^[\\/]/.test(file.subfolder))throw new Error('Invalid repair output path.');return bytes(await fetchLocal('view?'+new URLSearchParams(file)),32*1024*1024);};
  const mask=plan.mask??await retrieve('90');await maskPixels(mask,source.width,source.height);
  if(!plan.mask)await storage.putRepairMask(maskId,mask);
  const result=await compositeRepair(source,await retrieve('9'),mask),file=randomUUID()+'.png';await storage.putGenerated(file,result.bytes);
  const detailPasses=request.repair.selection==='auto_face'?['Detail pass applied: face repair']:['Detail pass applied: masked local repair'];captureLocal({detailPasses});
  return {reproducibility,imageUrl:'/api/generated/'+file,provider:'comfyui',detailPasses,repair:{request:request.repair,sourceVersion:request.sourceVersion,maskId,maskMethod:request.repair.selection==='auto_face'?'FaceDetailer / '+config.face_detector:'manual rectangle / inward feather',outsideMaskUnchanged:true,changedPixels:result.changedPixels,settings},...(refs.length?{referenceConditioning:{mode:'ip-adapter' as const,model:env.COMFYUI_IPADAPTER_MODEL||defaultAdapter,encoder:env.COMFYUI_CLIP_VISION_MODEL||defaultEncoder,references:refs.map(({id,role,strength,weightType,sha256})=>({id,role,strength,weightType,sha256}))}}:{})};
 });
}

