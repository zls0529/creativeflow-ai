import 'server-only';
import sharp from 'sharp';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {ProductHeroInput,SegmentationReport} from '@/types/product-hero';
import {storage} from '@/lib/storage';
import {executionCheckpoint} from '@/lib/jobs/context';
import {measure} from '@/lib/usage/capture';
import {validateRepairNodes} from '@/lib/providers/image/repair';
import {getWorkflow} from '@/lib/workflows/registry';
import {templateHash} from '@/lib/workflows/hash';
import {decodeProduct} from './composite';
import {inspectProductMask,validateProductMask} from './mask';
import {whiteBackgroundMask} from './white-background';
import {getMaskArtifact,readSegmentationReport,saveMaskArtifact,saveSegmentationReport,SegmentationError,sha} from './segmentation-store';
import {productTransport} from './transport';
type Graph=Record<string,{class_type:string;inputs:Record<string,unknown>}>;
type Source=Awaited<ReturnType<typeof decodeProduct>>;
export type ExtractionPlan={input:ProductHeroInput;source:Source;sourceSha256:string;sam:string;segmentationGraph:Graph;segmentationTemplate:Graph};
export async function segmentationPlan(input:ProductHeroInput,env:Record<string,string|undefined>=process.env):Promise<ExtractionPlan>{
 const bytes=await storage.get(input.sourceId),source=await decodeProduct(bytes),template=JSON.parse(await readFile('comfyui/workflows/product_hero_segmentation_guided_api.json','utf8')) as Graph;
 if(templateHash(template)!==getWorkflow('product_hero_sam_v1','1.1.0').templateHash)throw new Error('Guided segmentation template hash mismatch.');
 const sam=env.COMFYUI_PRODUCT_HERO_SAM_MODEL||'sam_vit_b_01ec64.pth';if(!/^sam_vit_[blh]_[a-z0-9]+\.pth$/.test(sam))throw new Error('Use an installed SAM checkpoint filename.');
 const segmentationGraph=structuredClone(template);segmentationGraph['5'].inputs.model_name=sam;
 return {input,source,sourceSha256:sha(bytes),segmentationTemplate:template,sam,segmentationGraph};
}
async function removalGraph(env:Record<string,string|undefined>,catalog:Parameters<typeof validateRepairNodes>[1]){
 // Node discovery alone does not prove that weights are installed: Easy Use downloads
 // missing files. Require a local server and verify its explicit model root first.
 if(env.COMFYUI_PRODUCT_HERO_REMBG!=='rmbg14')throw new Error('RMBG is not configured; uniform-background removal remains available.');
 const url=new URL(env.COMFYUI_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!env.COMFYUI_LOCAL_ROOT)throw new Error('RMBG requires a loopback server and COMFYUI_LOCAL_ROOT to verify installed weights.');
 const model=path.join(env.COMFYUI_LOCAL_ROOT,'models','rembg','RMBG-1.4.pth');
 try{if((await stat(model)).size<1_000_000)throw new Error();}catch{throw new Error('Installed RMBG-1.4.pth is missing. No model will be downloaded.');}
 const graph=JSON.parse(await readFile('comfyui/workflows/product_hero_rembg_api.json','utf8')) as Graph;
 if(templateHash(graph)!==getWorkflow('product_hero_rembg_v1','1.0.0').templateHash)throw new Error('Background removal template hash mismatch.');
 validateRepairNodes(graph,catalog);return graph;
}
async function manualMask(plan:ExtractionPlan){
 if(!plan.input.manualMaskId||!plan.input.manualMaskConfirmed)throw new Error('Upload a manual mask and confirm it matches the product.');
 const r=await readSegmentationReport(plan.input.manualMaskId);
 if(r.sourceId!==plan.input.sourceId||r.sourceSha256!==plan.sourceSha256||!r.accepted||r.selectedMethod!=='manual'||!r.maskUrl)throw new Error('Manual mask is invalid or belongs to a different source.');
 const b=await getMaskArtifact(r.maskUrl);if(sha(b)!==r.maskSha256)throw new Error('Stored manual mask checksum mismatch.');
 await validateProductMask(b,plan.source.width,plan.source.height);return b;
}
export async function extractionReadiness(plan:ExtractionPlan,env:Record<string,string|undefined>,catalog:Parameters<typeof validateRepairNodes>[1]){
 const mode=plan.input.segmentation;
 let removalNote='';
 if(mode==='manual'){await manualMask(plan);return 'Ready: validated and confirmed manual mask.';}
 if(mode==='auto'||mode==='source_alpha')try{await validateProductMask(await sharp(plan.source.bytes).extractChannel('alpha').png().toBuffer(),plan.source.width,plan.source.height);return 'Ready: alpha available and validated.';}catch(e){if(mode==='source_alpha')throw e;}
 if(mode==='auto'||mode==='background_removal'){
  try{await removalGraph(env,catalog);return 'Ready: installed RMBG background removal available.';}catch(e){if(env.COMFYUI_PRODUCT_HERO_REMBG==='rmbg14')removalNote=' Configured RMBG unavailable: '+(e instanceof Error?e.message:'dependency check failed.');}
  try{await validateProductMask(await whiteBackgroundMask(plan.source.bytes,plan.source.width,plan.source.height),plan.source.width,plan.source.height);return 'Ready: uniform bright-background removal available; inspect completeness after extraction.'+removalNote;}catch(e){if(mode==='background_removal')throw new Error('No usable background removal path. '+(e instanceof Error?e.message:'')+removalNote);}
 }
 try{validateRepairNodes(plan.segmentationGraph,catalog);return 'Ready: guided SAM available. Bounding region centre must lie on the product.'+removalNote;}catch(e){throw new Error('No usable automatic segmentation path. '+(e instanceof Error?e.message:'Guided SAM dependencies unavailable.')+removalNote+' Upload and confirm a manual mask.');}
}
export async function extractProduct(plan:ExtractionPlan,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch){
 const {source,input}=plan,report:SegmentationReport={id:randomUUID(),sourceId:input.sourceId,sourceSha256:plan.sourceSha256,sourceImageUrl:await saveMaskArtifact(source.bytes),createdAt:new Date().toISOString(),attempts:[],accepted:false,selectedMethod:null,userIntervention:input.segmentation==='manual'};
 let selected:Buffer|undefined,usedGraph:Graph|undefined,usedTemplate:Graph|undefined;
 const attempt=async(method:string,model:string|null,run:()=>Promise<Buffer>,template?:Graph)=>{
  await executionCheckpoint();const a:SegmentationReport['attempts'][number]={method,model,accepted:false,...(template?{templateHash:templateHash(template)}:{})};if(method==='guided_sam')a.guidance=input.sourceRegion;report.attempts.push(a);
  try{const b=await run();if(method==='rmbg14'&&usedTemplate)a.templateHash=templateHash(usedTemplate);a.maskUrl=await saveMaskArtifact(b);a.maskSha256=sha(b);const result=await inspectProductMask(b,source.width,source.height);a.diagnostics=result.diagnostics;a.accepted=result.diagnostics.accepted;if(a.accepted){selected=b;report.accepted=true;report.selectedMethod=method;report.maskUrl=a.maskUrl;report.maskSha256=a.maskSha256;}else a.reason=result.diagnostics.reasons.join(' ');}
  catch(e){a.reason=e instanceof Error?e.message:'Extraction failed.';}
  // Each completed attempt is immutable, even if a later provider or cancellation fails.
  await saveSegmentationReport({...report,id:randomUUID()});
 };
 const mode=input.segmentation,transport=productTransport;
 try{
  if(mode==='manual')await attempt('manual',null,()=>manualMask(plan));
  if(mode==='auto'||mode==='source_alpha')await attempt('source_alpha',null,()=>sharp(source.bytes).extractChannel('alpha').png().toBuffer());
  if(!selected&&(mode==='auto'||mode==='background_removal')){
   if(env.COMFYUI_PRODUCT_HERO_REMBG==='rmbg14')await attempt('rmbg14','RMBG-1.4',async()=>{
    const t=transport(env,fetcher),graph=await removalGraph(env,await t.catalog());usedTemplate=structuredClone(graph);graph['1'].inputs.image=await t.upload(source.bytes);usedGraph=graph;
    return measure('comfyui','image','product_hero_segmentation','RMBG-1.4',()=>t.run(graph));
   });
   if(!selected)await attempt('white_border_v1',null,()=>whiteBackgroundMask(source.bytes,source.width,source.height));
  }
  if(!selected&&(mode==='auto'||mode==='sam'))await attempt('guided_sam',plan.sam,async()=>{
   const t=transport(env,fetcher),graph=structuredClone(plan.segmentationGraph);validateRepairNodes(graph,await t.catalog());const {width,height}=source,r=input.sourceRegion,region=Buffer.alloc(width*height);
   for(let y=Math.round(r.y*height);y<Math.round((r.y+r.height)*height);y++)region.fill(255,y*width+Math.round(r.x*width),y*width+Math.round((r.x+r.width)*width));
   graph['1'].inputs.image=await t.upload(source.bytes);graph['2'].inputs.image=await t.upload(await sharp(region,{raw:{width,height,channels:1}}).png().toBuffer());usedGraph=graph;usedTemplate=plan.segmentationTemplate;
   return measure('comfyui','image','product_hero_segmentation',plan.sam,()=>t.run(graph));
  },plan.segmentationTemplate);
 }finally{await saveSegmentationReport(report);}
 if(!selected)throw new SegmentationError(report);
 // A failed neural candidate followed by local success must not be presented as
 // the selected graph, but remains recorded in the attempt history.
 if(!['guided_sam','rmbg14'].includes(report.selectedMethod!)){usedGraph=undefined;usedTemplate=undefined;}
 return {mask:selected,report,graph:usedGraph,template:usedTemplate};
}
export async function acceptManualMask(sourceId:string,bytes:Buffer){
 if(bytes.length>10*1024*1024)throw new Error('Mask upload exceeds 10 MB.');
 const original=await storage.get(sourceId),source=await decodeProduct(original),m=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
 if(m.format!=='png'||(m.pages??1)!==1)throw new Error('Upload one grayscale PNG mask: white product, black background.');
 // Reject alpha semantics here rather than guessing whether black transparent pixels mean foreground.
 const mask=bytes,url=await saveMaskArtifact(mask),report:SegmentationReport={id:randomUUID(),sourceId,sourceSha256:sha(original),sourceImageUrl:await saveMaskArtifact(source.bytes),createdAt:new Date().toISOString(),attempts:[{method:'manual',model:null,maskUrl:url,maskSha256:sha(mask),accepted:false}],accepted:false,selectedMethod:'manual',userIntervention:true,maskUrl:url,maskSha256:sha(mask)};
 try{if(m.hasAlpha&&(await sharp(bytes).extractChannel('alpha').stats()).channels[0].min<255)throw new Error('Use an opaque grayscale PNG mask; transparency is ambiguous.');const result=await inspectProductMask(mask,source.width,source.height);report.accepted=result.diagnostics.accepted;Object.assign(report.attempts[0],{accepted:report.accepted,diagnostics:result.diagnostics,reason:result.diagnostics.reasons.join(' ')||undefined});}catch(e){report.attempts[0].reason=e instanceof Error?e.message:'Invalid mask.';}
 await saveSegmentationReport(report);if(!report.accepted)throw new SegmentationError(report);return report;
}
