import 'server-only';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {storage} from '@/lib/storage';
import {fillWorkflow,comfySizes} from '@/lib/providers/image/comfyui';
import {validateRepairNodes} from '@/lib/providers/image/repair';
import {applyReferenceWorkflow,defaultAdapter,defaultEncoder} from '@/lib/providers/image/reference-workflow';
import {loadReferences} from '@/lib/providers/image/references';
import {measure} from '@/lib/usage/capture';
import {executionCheckpoint,executionFence} from '@/lib/jobs/context';
import {recordReproducibility} from '@/lib/workflows/reproducibility';
import {getWorkflow} from '@/lib/workflows/registry';
import {templateHash} from '@/lib/workflows/hash';
import {productHeroInputSchema,productHeroMetadataSchema,type ProductHeroInput} from '@/types/product-hero';
import type {ImageRequest,ImageResult} from '@/lib/providers/image/base';
import type {CampaignView} from '@/types/campaign';
import {decodeProduct,validateProductMask,compositeProduct} from './composite';
import {productTransport} from './transport';
import {extractProduct,extractionReadiness} from './segmentation';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
// Existing foreground prompts often contain "emphasize shoes". Never copy those
// clauses into the empty background's positive conditioning.
function backgroundOnly(text:string){return text.split(/[.;,]/).map(s=>s.trim()).filter(s=>s&&(!/\b(products?|shoes?|bottles?|runners?|athletes?|persons?|packaging|people|logos?|letters?|text|writing)\b/i.test(s)||/^(no|without|avoid|exclude)\b/i.test(s))).join(', ');}
export function productHeroRequest(c:CampaignView,assetId:string|undefined,input:ProductHeroInput){
 const parsed=productHeroInputSchema.parse(input),asset=c.assets.find(a=>a.id===assetId);
 if(!asset||!c.brandProfile||!c.direction)throw new Error('Product Hero requires an existing asset, Brand Profile and Creative Direction.');
 if(!c.uploads.some(u=>u.id===parsed.sourceId&&u.role==='product'))throw new Error('Select a product reference belonging to this campaign.');
 if(parsed.styleId&&!c.uploads.some(u=>u.id===parsed.styleId&&['style','reference'].includes(u.role)))throw new Error('Style reference does not belong to this campaign.');
 const prompt={...asset.prompt,subject:'Exactly one preserved product from the supplied reference, retaining original shape, parts, colour and existing markings. No person or additional product.',environment:parsed.backgroundDirection||asset.prompt.environment,composition:`${parsed.placement} product placement with ${parsed.copySpace} copy space; safe margins and complete product.`,camera:'Preserve the supplied product view and proportions; no perspective warp.',brand_constraints:asset.prompt.brand_constraints+' Preserve existing product markings; do not invent new lettering or logos.'};
 const request:ImageRequest={prompt,brand:c.brandProfile,direction:c.direction,brandName:c.brandName,kind:asset.kind,...comfySizes[asset.kind],version:Math.max(0,...asset.generations.map(g=>g.version))+1,references:c.uploads,productHero:parsed};
 return {asset,request};
}
export async function productHeroPlan(request:ImageRequest,env:Record<string,string|undefined>){
 const input=productHeroInputSchema.parse(request.productHero);
 const ref=request.references.find(r=>r.id===input.sourceId&&r.role==='product');if(!ref)throw new Error('A stored product reference is required.');
 let bytes:Buffer;try{bytes=await storage.get(ref.id);}catch{throw new Error('Product reference is missing from storage.');}
 const source=await decodeProduct(bytes),checkpoint=env.COMFYUI_CHECKPOINT_NAME?.trim();if(!checkpoint)throw new Error('Missing COMFYUI_CHECKPOINT_NAME.');
 const backgroundTemplate=JSON.parse(await readFile('comfyui/workflows/product_hero_background_api.json','utf8')),
  segmentationTemplate=JSON.parse(await readFile('comfyui/workflows/product_hero_segmentation_guided_api.json','utf8'));
 const w=getWorkflow('product_hero_v1','1.0.0'),seg=getWorkflow('product_hero_sam_v1','1.1.0');
 if(templateHash(backgroundTemplate)!==w.templateHash||templateHash(segmentationTemplate)!==seg.templateHash)throw new Error('Product Hero template hash mismatch. Register a reviewed workflow version.');
 const sam=env.COMFYUI_PRODUCT_HERO_SAM_MODEL||'sam_vit_b_01ec64.pth';if(!/^sam_vit_[blh]_[a-z0-9]+\.pth$/.test(sam))throw new Error('Product Hero requires an installed SAM checkpoint; automatic downloads are unsupported.');
 const segmentationGraph=structuredClone(segmentationTemplate) as Record<string,{class_type:string;inputs:Record<string,unknown>}>;
 segmentationGraph['5'].inputs.model_name=sam;
 const size=comfySizes[request.kind],placement=`Reserve an empty ${input.placement} area for a single product to be composited later. Copy space ${input.copySpace}. Empty horizontal support plane, neutral product illumination.`,
 positive=['Empty commercial campaign background only. No foreground product, person or writing',...[input.backgroundDirection||request.prompt.environment,request.direction.mood,request.direction.photography_style,request.direction.lighting,request.prompt.style,request.prompt.colour_palette,request.prompt.brand_constraints].map(backgroundOnly),placement].filter(Boolean).join('. '),
 negative=[...new Set([request.prompt.negative_prompt,'product, duplicate product, shoe, extra shoe, bottle, extra bottle, random packaging, person, logo, letters, text, watermark, foreground object'].join(',').split(',').map(s=>s.trim()).filter(Boolean))].join(', ');
 let graph=fillWorkflow(backgroundTemplate,{checkpoint,positive,negative,...size,seed:input.seed,steps:20,cfg:7,sampler:'euler',scheduler:'normal'});
 const styleRefs=input.styleId?await loadReferences({...request,productReference:undefined,styleReference:undefined,references:request.references.filter(r=>r.id===input.styleId)}):[];
 if(input.styleId&&!styleRefs.length)throw new Error('Selected style reference is unavailable.');
 let extension:unknown;if(styleRefs.length){extension=JSON.parse(await readFile('comfyui/workflows/reference_conditioning_api.json','utf8'));graph=applyReferenceWorkflow(graph,extension,styleRefs.map(r=>({...r,image:'pending.png'})),defaultAdapter,defaultEncoder);}
 let sourceMask:Buffer|undefined;if(input.segmentation==='source_alpha'){const alpha=await sharp(source.bytes).extractChannel('alpha').png().toBuffer();sourceMask=(await validateProductMask(alpha,source.width,source.height)).png;}
 return {input,source,sourceSha256:digest(bytes),backgroundTemplate,segmentationTemplate,segmentationGraph,graph,extension,styleRefs,sourceMask,sam,size,prompts:{positive,negative}};
}
export async function generateProductHero(request:ImageRequest,env:Record<string,string|undefined>,progress:(stage:string)=>Promise<void>=async()=>{},fetcher:typeof fetch=fetch):Promise<ImageResult>{
 const start=Date.now(),plan=await productHeroPlan(request,env),transport=productTransport(env,fetcher),catalog=await transport.catalog();
 validateRepairNodes(plan.graph,catalog);await extractionReadiness(plan,env,catalog);
 const next=async(s:string)=>{await executionCheckpoint();await progress(s);};
 await next('Product extraction');const segStart=Date.now();
 const extraction=await extractProduct(plan,env,fetcher),mask=extraction.mask;
 await validateProductMask(mask,plan.source.width,plan.source.height);const segmentationMs=Date.now()-segStart;
 await next('Background generation');const bgStart=Date.now();
 const background=await measure('comfyui','image','product_hero_background',env.COMFYUI_CHECKPOINT_NAME??null,async()=>{
  if(plan.styleRefs.length){const refs=[];for(const ref of plan.styleRefs)refs.push({...ref,image:await transport.upload(ref.bytes)});plan.graph=applyReferenceWorkflow(fillWorkflow(plan.backgroundTemplate,{checkpoint:env.COMFYUI_CHECKPOINT_NAME!,...plan.prompts,...plan.size,seed:plan.input.seed,steps:20,cfg:7,sampler:'euler',scheduler:'normal'}),plan.extension,refs,defaultAdapter,defaultEncoder);}
  return transport.run(plan.graph);
 });const backgroundMs=Date.now()-bgStart;
 const m=await sharp(background).metadata();if(m.width!==plan.size.width||m.height!==plan.size.height)throw new Error('Background dimensions do not match Product Hero output profile.');
 await next('Compositing / shadow integration');const compStart=Date.now(),result=await compositeProduct(plan.source,mask,background,plan.input),compositingMs=Date.now()-compStart;
 await executionFence();
 const artifacts:Record<string,string>={};for(const [key,bytes] of Object.entries({source:plan.source.bytes,mask:result.mask,foreground:result.foreground,background,output:result.png})){const name=randomUUID()+'.png';await storage.putGenerated(name,bytes);artifacts[key]='/api/generated/'+name;}
 const segDefinition=extraction.report.selectedMethod==='rmbg14'?getWorkflow('product_hero_rembg_v1','1.0.0'):getWorkflow('product_hero_sam_v1','1.1.0');
 const reproducibility=recordReproducibility({mode:'product_hero_v1',template:plan.backgroundTemplate,extension:plan.extension,extraTemplates:extraction.template?[{file:segDefinition.workflowTemplate!,template:extraction.template,expectedHash:segDefinition.templateHash!}]:[],graph:{...plan.graph,...(extraction.graph?Object.fromEntries(Object.entries(extraction.graph).map(([id,node])=>['seg_'+id,node])):{})},...plan.size,catalog,references:plan.styleRefs.map(({id,role,strength,weightType,sha256})=>({id,role,strength,weightType,sha256}))});
 const productHero=productHeroMetadataSchema.parse({input:plan.input,sourceSha256:plan.sourceSha256,sourceImageUrl:artifacts.source,maskUrl:artifacts.mask,foregroundUrl:artifacts.foreground,backgroundUrl:artifacts.background,segmentation:{method:extraction.report.selectedMethod!,model:extraction.report.attempts.find(a=>a.accepted)?.model??null,report:extraction.report,sourceWidth:plan.source.width,sourceHeight:plan.source.height,maskSha256:digest(result.mask)},contract:'preserve-transformed-opaque-core-v1',placement:result.placement,backgroundPrompt:plan.prompts,shadow:'procedural-contact-and-soft-cast-v1',reflection:plan.input.reflection,integration:plan.input.edgeIntegration?'bounded edge-only luminance matching; opaque core unchanged':'none; opaque core unchanged',edgeFeatherPx:1,inpaint:'none',upscale:'none; compose at final resolution',fidelity:result.fidelity,durationsMs:{segmentation:segmentationMs,background:backgroundMs,compositing:compositingMs,repair:0,total:Date.now()-start}});
 return {imageUrl:artifacts.output,provider:'comfyui',reproducibility,productHero};
}
