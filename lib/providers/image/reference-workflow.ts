import 'server-only';
import {z} from 'zod';
const graphSchema=z.record(z.object({class_type:z.string(),inputs:z.record(z.unknown())}));
type Graph=z.infer<typeof graphSchema>;
export const defaultAdapter='ip-adapter-plus_sd15.safetensors';
export const defaultEncoder='CLIP-ViT-H-14-laion2B-s32B-b79_CLIP-ViT-H-14.safetensors';
type Reference={role:'product'|'style';strength:number;image:string};
export function referenceDependencies(capabilities:Record<string,{input?:{required?:Record<string,unknown[]>}}>,model:string,encoder:string){
  for(const name of ['LoadImage','IPAdapterModelLoader','CLIPVisionLoader','IPAdapterAdvanced'])if(!capabilities?.[name]?.input?.required)throw new Error(`Reference conditioning unavailable: missing ${name}. No reference was ignored.`);
  for(const [node,key,value] of [['IPAdapterModelLoader','ipadapter_file',model],['CLIPVisionLoader','clip_name',encoder]]){
    const choices=capabilities[node].input?.required?.[key]?.[0];
    if(!Array.isArray(choices)||!choices.includes(value))throw new Error(`Reference conditioning unavailable: configured ${key} is not installed. Use the documented SD1.5 Plus adapter and ViT-H encoder. No fallback attempted.`);
  }
  const weights=capabilities.IPAdapterAdvanced.input?.required?.weight_type?.[0];
  if(!Array.isArray(weights)||!weights.includes('linear')||!weights.includes('style transfer'))throw new Error('Reference conditioning unavailable: IPAdapterAdvanced must support linear and style transfer weights.');
}
export function applyReferenceWorkflow(base:Graph,template:unknown,refs:Reference[],model:string,encoder:string):Graph{
  if(!refs.length)return base;
  const parsed=graphSchema.safeParse(template);
  const fail=()=>{throw new Error('Invalid reference conditioning template. Restore reference_conditioning_api.json; no fallback attempted.');};
  if(!parsed.success)return fail();const graph=parsed.data;
  const expected={'40':'CLIPVisionLoader','41':'IPAdapterModelLoader','42':'LoadImage','43':'IPAdapterAdvanced','44':'LoadImage','45':'IPAdapterAdvanced'};
  if(Object.keys(graph).length!==6 || Object.entries(expected).some(([id,t])=>graph[id]?.class_type!==t || base[id]))return fail();
  if(graph['40'].inputs.clip_name!=='{{encoder}}'||graph['41'].inputs.ipadapter_file!=='{{adapter}}')return fail();
  for(const [id,img,type] of [['43','42','linear'],['45','44','style transfer']]){
    const inputs=graph[id].inputs;
    for(const [key,value] of Object.entries({model:['4',0],ipadapter:['41',0],clip_vision:['40',0],image:[img,0],weight:'{{strength}}',weight_type:type,combine_embeds:'concat',start_at:0,end_at:1,embeds_scaling:'V only'}))if(JSON.stringify(inputs[key])!==JSON.stringify(value))return fail();
    if(graph[img].inputs.image!=='{{image}}')return fail();
  }
  graph['40'].inputs.clip_name=encoder;graph['41'].inputs.ipadapter_file=model;
  const result:Graph={...structuredClone(base),'40':graph['40'],'41':graph['41']};let previous: [string,number]=['4',0];
  // Apply style first, then the stronger product branch. Do not feed product embeddings to FaceDetailer.
  for(const role of ['style','product'] as const){
    const ref=refs.find(r=>r.role===role);if(!ref)continue;
    const [image,adapter]=role==='product'?['42','43']:['44','45'];
    result[image]=graph[image];result[image].inputs.image=ref.image;
    result[adapter]=graph[adapter];Object.assign(result[adapter].inputs,{model:previous,weight:ref.strength});previous=[adapter,0];
  }
  for(const id of ['3','11'])if(result[id])result[id].inputs.model=previous;
  return result;
}
