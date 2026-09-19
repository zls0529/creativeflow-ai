// Read-only research audit. No provider, agent, queue or generation code is invoked.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import sharp from 'sharp';
import {auditRegistry,registry} from '../lib/workflows/registry';
import {checkDependencies,probeDependencies,publicName,type Catalog} from '../lib/workflows/dependencies';
const db=new PrismaClient();
const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
async function main(){
 if(process.argv.includes('--registry-only')){
  const audit=await auditRegistry();let probe:Awaited<ReturnType<typeof probeDependencies>>|undefined;
  if(process.argv.includes('--local-capabilities')){try{probe=await probeDependencies();}catch{console.error('Local dependency probe unavailable; registry audit continues.');process.exitCode=1;}}
  const dependencies=registry.filter(w=>w.kind!=='placeholder').map(w=>{const check=checkDependencies(w,process.env,probe?.catalog);return {id:w.id,version:w.version,...check,snapshot:{...check.snapshot,source:probe?'explicit_read_only_probe':check.snapshot.source,comfyuiVersion:probe?.comfyuiVersion??null}};});
  if(audit.unregisteredTemplates.length||audit.workflows.some(w=>!['match','placeholder'].includes(w.state))||dependencies.some(d=>d.state==='unavailable'))process.exitCode=1;
  console.log(JSON.stringify({readOnly:true,...audit,dependencies},null,2));return;
 }
 const templates=[];
 for(const file of (await readdir('comfyui/workflows')).filter(f=>f.endsWith('.json')).sort()){
  const bytes=await readFile('comfyui/workflows/'+file),graph=JSON.parse(bytes.toString()) as Record<string,{class_type:string;inputs:Record<string,unknown>}>;
  templates.push({file,sha256:hash(bytes),nodeCount:Object.keys(graph).length,nodes:[...new Set(Object.values(graph).map(n=>n.class_type))]});
 }
 const references=[];
 for(const file of ['shoes.jpg','reference.jpg','storage/generated/40b024cb-f84e-400d-b4d4-e90d3a65cc80.png']){
  const bytes=await readFile(file),m=await sharp(bytes).metadata();references.push({file,sha256:hash(bytes),bytes:bytes.length,width:m.width,height:m.height,format:m.format});
 }
 const rows=await db.generation.findMany({orderBy:{id:'asc'},include:{evaluation:true,asset:{select:{kind:true,campaign:{select:{name:true}}}}}});
 const historyDigest=hash(JSON.stringify(rows.map(g=>({id:g.id,prompt:g.prompt,imageUrl:g.imageUrl,evaluation:g.evaluation?.data??null}))));
 const evidence=rows.filter(g=>g.asset.campaign.name==='Midnight Pulse — workflow comparison').map(g=>{
  const prompt=JSON.parse(g.prompt),evaluation=g.evaluation?JSON.parse(g.evaluation.data):null;
  return {id:g.id,placement:g.asset.kind,version:g.version,imageUrl:g.imageUrl,provider:g.provider,status:g.status,context:prompt._generation??null,evaluation};
 }).sort((a,b)=>a.placement.localeCompare(b.placement)||a.version-b.version);
 let localCapabilities:unknown={status:'not_requested'},dependencyCatalog:Catalog|undefined,comfyuiVersion:string|null=null;
 if(process.argv.includes('--local-capabilities')){
  try{
   const probe=await probeDependencies(process.env);const catalog=probe.catalog;dependencyCatalog=catalog;comfyuiVersion=probe.comfyuiVersion;
   const wanted=['VAEEncode','VAEEncodeForInpaint','InpaintModelConditioning','SetLatentNoiseMask','ImageCompositeMasked','DifferentialDiffusion','FaceDetailer','DetailerForEach','UltralyticsDetectorProvider','SAMLoader','OpenposePreprocessor','DWPreprocessor','ControlNetLoader','IPAdapterAdvanced','IPAdapterModelLoader','CLIPVisionLoader','ImageUpscaleWithModel','UpscaleModelLoader','ImageScale','Canny','MiDaS-DepthMapPreprocessor','LineArtPreprocessor'];
   localCapabilities={status:'read_only_get',comfyuiVersion,nodes:Object.fromEntries(wanted.map(n=>[n,!!catalog[n]])),models:Object.fromEntries([['CheckpointLoaderSimple','ckpt_name'],['ControlNetLoader','control_net_name'],['IPAdapterModelLoader','ipadapter_file'],['CLIPVisionLoader','clip_name'],['UltralyticsDetectorProvider','model_name'],['SAMLoader','model_name'],['UpscaleModelLoader','model_name']].map(([n,k])=>{const list=catalog[n]?.input?.required?.[k]?.[0];return [n,Array.isArray(list)?list.map(publicName):null];}))};
  }catch{localCapabilities={status:'unavailable_no_generation_attempted'};}
 }
 const workflowRegistry=await auditRegistry();
 const registryDependencies=registry.filter(w=>w.kind!=='placeholder').map(w=>{const check=checkDependencies(w,process.env,dependencyCatalog);return {id:w.id,version:w.version,...check,snapshot:{...check.snapshot,source:dependencyCatalog?'explicit_read_only_probe':check.snapshot.source,comfyuiVersion}};});
 console.log(JSON.stringify({auditedAt:new Date().toISOString(),readOnly:true,counts:{campaigns:await db.campaign.count(),generations:rows.length,activeJobs:await db.executionJob.count({where:{status:{in:['queued','running','cancel_requested']}}})},historyDigest,templates,references,localCapabilities,workflowRegistry,registryDependencies,evidence},null,2));
}
main().catch(()=>{console.error('Read-only workflow audit failed; no generation attempted.');process.exitCode=1;}).finally(()=>db.$disconnect());
