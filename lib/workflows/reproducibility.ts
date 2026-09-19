import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {reproducibilitySchema,type Reproducibility} from '@/types/workflow';
import {getWorkflow,workflowForMode} from './registry';
import {checksum,templateHash} from './hash';
import {dependencySnapshot,publicName,type Catalog} from './dependencies';

const context=new AsyncLocalStorage<(value:Reproducibility)=>void>();
export function withReproducibility<T>(capture:(value:Reproducibility)=>void,work:()=>Promise<T>){return context.run(capture,work);}
type Graph=Record<string,{class_type:string;inputs:Record<string,unknown>}>;
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function recordReproducibility(input:{mode:string;template:unknown;extension?:unknown;extraTemplates?:{file:string;template:unknown;expectedHash:string}[];graph:Graph;width:number;height:number;catalog?:Catalog;pose?:{id:string;sha256:string};references?:Reproducibility['references']}):Reproducibility{
 const w=workflowForMode(input.mode),g=input.graph,hash=templateHash(input.template),templates=[{file:w.workflowTemplate!,hash}];
 let matches=hash===w.templateHash;
 if(input.extension){const extension=getWorkflow('reference_sd15_v1','1.0.0'),hash=templateHash(input.extension);templates.push({file:extension.workflowTemplate!,hash});matches&&=hash===extension.templateHash;}
 for(const extra of input.extraTemplates??[]){const hash=templateHash(extra.template);templates.push({file:extra.file,hash});matches&&=hash===extra.expectedHash;}
 const samplers=Object.entries(g).filter(([,n])=>['KSampler','FaceDetailer','SamplerCustomAdvanced'].includes(n.class_type));
 for(const [,n] of samplers){if(n.class_type!=='SamplerCustomAdvanced')continue;
  const linked=(key:string)=>{const link=n.inputs[key];return Array.isArray(link)?g[String(link[0])]?.inputs??{}:{};};
  // Normalize a copy only; the submitted graph stays unchanged.
  const normalized={...n.inputs,seed:linked('noise').noise_seed,steps:linked('sigmas').steps,cfg:linked('guider').cfg,sampler_name:linked('sampler').sampler_name,scheduler:'Flux2Scheduler'};
  const index=samplers.findIndex(([,s])=>s===n);samplers[index]=[samplers[index][0],{...n,inputs:normalized}];
 }
 const modelKeys:Record<string,[string,string]>={UNETLoader:['checkpoint','unet_name'],CLIPLoader:['text_encoder','clip_name'],VAELoader:['vae','vae_name'],SAMLoader:['segmentation','model_name'],CheckpointLoaderSimple:['checkpoint','ckpt_name'],ControlNetLoader:['controlnet','control_net_name'],IPAdapterModelLoader:['adapter','ipadapter_file'],CLIPVisionLoader:['encoder','clip_name'],UltralyticsDetectorProvider:['detector','model_name']};
 const models=Object.values(g).flatMap(n=>modelKeys[n.class_type]?[{role:modelKeys[n.class_type][0],name:publicName(n.inputs[modelKeys[n.class_type][1]])}]:[]);
 const face=Object.values(g).find(n=>n.class_type==='FaceDetailer'),pose=Object.values(g).find(n=>n.class_type==='ControlNetApplyAdvanced');
 const detailKeys=['steps','cfg','denoise','seed','guide_size','guide_size_for','max_size','feather','noise_mask','force_inpaint','bbox_threshold','bbox_dilation','bbox_crop_factor','drop_size','cycle'];
 const value=reproducibilitySchema.parse({schemaVersion:1,workflowId:w.id,workflowVersion:w.version,templateHash:hash,definitionHash:checksum(templates.slice().sort((a,b)=>a.file.localeCompare(b.file))),hashAlgorithm:'sha256-canonical-json-v1',registeredHashMatches:matches,templates,
  checkpoint:models.find(m=>m.role==='checkpoint')?.name??null,seed:number(samplers[0]?.[1].inputs.seed),resolution:{width:input.width,height:input.height},
  sampling:samplers.map(([nodeId,n])=>({nodeId,stage:n.class_type==='FaceDetailer'?'face_detail':nodeId==='11'?'refinement':'base_or_repair',seed:number(n.inputs.seed),steps:number(n.inputs.steps),cfg:number(n.inputs.cfg),sampler:publicName(n.inputs.sampler_name),scheduler:publicName(n.inputs.scheduler),denoise:number(n.inputs.denoise),width:nodeId==='3'&&g['5']?.class_type==='EmptyLatentImage'?number(g['5'].inputs.width):n.class_type==='FaceDetailer'?null:input.width,height:nodeId==='3'&&g['5']?.class_type==='EmptyLatentImage'?number(g['5'].inputs.height):n.class_type==='FaceDetailer'?null:input.height})),
  controlNet:pose?[{model:models.find(m=>m.role==='controlnet')?.name??null,strength:number(pose.inputs.strength),start:number(pose.inputs.start_percent),end:number(pose.inputs.end_percent),preprocessor:publicName(Object.values(g).find(n=>n.class_type==='OpenposePreprocessor')?.class_type),sourceId:publicName(input.pose?.id),sourceSha256:input.pose?.sha256??null}]:[],
  references:input.references??[],detailer:{enabled:!!face,detector:models.find(m=>m.role==='detector')?.name??null,parameters:Object.fromEntries(detailKeys.flatMap(k=>face&&(typeof face.inputs[k]==='number'||typeof face.inputs[k]==='boolean')?[[k,face.inputs[k]]]:[]))},
  dependencies:dependencySnapshot(Object.values(g).map(n=>n.class_type),models,input.catalog),
  notes:['Captured from the actual submitted graph. Same seed does not promise bitwise reproducibility across environments.','Prompt text, upload paths, API credentials and absolute model paths are excluded from metadata hashing.',...(matches?[]:['Template differs from the registered release; this is not a verified registry bundle.'])],
 });
 context.getStore()?.(value);return value;
}
