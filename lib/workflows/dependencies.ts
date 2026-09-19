import 'server-only';
import {safeNameSchema,type WorkflowDefinition,dependencySnapshotSchema} from '@/types/workflow';
export type Catalog=Record<string,{input?:{required?:Record<string,unknown[]>;optional?:Record<string,unknown[]>};python_module?:string;version?:string}>;
export function publicName(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const name=value.split(/[\\/]/).at(-1)??'';
 return safeNameSchema.safeParse(name).success?name:null;
}
export function dependencySnapshot(nodes:string[],models:{role:string;name:string|null}[],catalog?:Catalog,version?:string,explicit=false){
 return dependencySnapshotSchema.parse({source:catalog?explicit?'explicit_read_only_probe':'existing_catalog':'not_queried',comfyuiVersion:publicName(version),
  nodes:[...new Set(nodes)].sort().map(classType=>({classType:publicName(classType)??'unknown',module:publicName(catalog?.[classType]?.python_module),version:publicName(catalog?.[classType]?.version),available:catalog?!!catalog[classType]:null})),
  models:models.map(m=>({role:publicName(m.role)??'unknown',name:publicName(m.name)})),runtime:{node:process.version,platform:process.platform,arch:process.arch},
  notes:['Node versions and ComfyUI version are null unless explicitly advertised. Model filenames do not establish file hashes or compatibility.',...(catalog?[]:['No extra dependency network probe was made during generation.'])]});
}
export function checkDependencies(w:WorkflowDefinition,env:Record<string,string|undefined>,catalog?:Catalog){
 const withoutFace=w.id.startsWith('legacy_sports')&&env.COMFYUI_SPORTS_FACE_DETAIL==='false';
 const nodes=w.requiredNodes.filter(n=>!withoutFace||!['FaceDetailer','UltralyticsDetectorProvider'].includes(n));
 const requirements=w.requiredModels.filter(m=>!withoutFace||m.role!=='detector');
 const missing:string[]=[];
 const models=requirements.map(m=>{const name=(m.environmentKey?env[m.environmentKey]:undefined)||m.defaultName;
  if(!name)missing.push('Missing configuration for '+m.role);
  else if(catalog){const options=catalog[m.node]?.input?.required?.[m.input]?.[0];if(!Array.isArray(options)||!options.includes(name))missing.push('Configured '+m.role+' is not advertised by '+m.node);}
  return {role:m.role,name:publicName(name)};
 });
 if(catalog)for(const n of nodes)if(!catalog[n])missing.push('Missing node '+n);
 return {state:missing.length?'unavailable':catalog?'advertised':'not_checked',missing,snapshot:dependencySnapshot(nodes,models,catalog)};
}
export async function probeDependencies(env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch){
 let base:URL;try{base=new URL(env.COMFYUI_URL??'');if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw new Error();}catch{throw new Error('Dependency probe requires a valid credential-free COMFYUI_URL.');}
 async function get(endpoint:string){
  const response=await fetcher(new URL(base.pathname.replace(/\/$/,'')+'/'+endpoint,base),{method:'GET',signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok||!response.body)throw new Error('Local dependency endpoint unavailable.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>16*1024*1024){await reader.cancel();throw new Error('Dependency response too large.');}chunks.push(r.value);}
  return JSON.parse(Buffer.concat(chunks).toString());
 }
 try{
  const catalog=await get('object_info');if(!catalog||typeof catalog!=='object'||Array.isArray(catalog))throw new Error();
  let comfyuiVersion:string|null=null;try{const stats=await get('system_stats');comfyuiVersion=publicName(stats?.system?.comfyui_version);}catch{/* Optional version discovery must not invalidate the node catalog. */}
  return {catalog:catalog as Catalog,comfyuiVersion};
 }catch{throw new Error('ComfyUI dependencies could not be inspected. No generation was requested.');}
}
