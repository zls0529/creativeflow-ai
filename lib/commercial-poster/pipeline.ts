import 'server-only';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {storage} from '@/lib/storage';
import {validateReferenceImage} from '@/lib/providers/image/references';
import {productTransport} from '@/lib/product-hero/transport';
import {checkDependencies,type Catalog} from '@/lib/workflows/dependencies';
import {getWorkflow} from '@/lib/workflows/registry';
import {templateHash} from '@/lib/workflows/hash';
import {recordReproducibility} from '@/lib/workflows/reproducibility';
import {measure,captureLocal} from '@/lib/usage/capture';
import {executionCheckpoint,executionFence} from '@/lib/jobs/context';
import {commercialPosterInputSchema,type CommercialPosterInput} from '@/types/commercial-poster';
import {activeRules} from '@/types/brand-intelligence';
import type {CampaignView} from '@/types/campaign';
import type {ImageRequest,ImageResult} from '@/lib/providers/image/base';

export const kleinModel='flux-2-klein-4b-fp8.safetensors';
export function kleinEnvironment(env:Record<string,string|undefined>){if(!env.COMFYUI_KLEIN_URL?.trim())throw new Error('Missing COMFYUI_KLEIN_URL for Commercial Poster.');return {...env,COMFYUI_URL:env.COMFYUI_KLEIN_URL};}
export function posterPrompt(c:CampaignView,request:ImageRequest){
 const p=request.prompt;
 const productComposition=p.composition.split(/[,.]/).map(s=>s.trim()).filter(s=>s&&!/\b(runner|person|people|athlete|body|feet|shoes)\b/i.test(s)).join(', ');
 const camera=/\b(panning|motion blur|runner|person|athlete)\b/i.test(p.camera)?'Sharp product photography; maintain the reference viewpoint':p.camera;
 const copySide=/\bleft\b/i.test(productComposition)?'to the left of':/\bright\b/i.test(productComposition)?'to the right of':'above';
 const parts=['Create a commercial campaign poster featuring exactly one product from the supplied reference. Preserve its silhouette, proportions, materials, colours and visible markings, and keep the reference viewpoint. The product is the prominent hero, fully visible with safe margins.',
  `Product role: ${request.brand.product}. Campaign goal: ${request.brand.campaign_goal}.`,
  `Scene: ${p.environment}. Composition: ${productComposition||'One clear product focal point'}. Camera: ${camera}.`,
  `Lighting: ${p.lighting}. Palette: ${p.colour_palette}. Visual style: ${p.style}. Campaign mood: ${request.direction.mood}.`,
  `Leave clean negative space ${copySide} the product for campaign copy; do not render new text or logos. No people or extra products. Use believable support and contact shadows.`,
  `Brand visual constraints: ${p.brand_constraints}.`,
  ...activeRules(c.brandIntelligence?.approved).filter(r=>r.binding||r.visuallyEvaluable).map(r=>`${r.binding?'Approved rule':'Visual guidance'} (${r.category}): ${r.text}`),
  p.negative_prompt?`Avoid these elements: ${p.negative_prompt}.`:''
 ];
 return [...new Set(parts.filter(Boolean))].join('\n');
}
export function commercialPosterRequest(c:CampaignView,assetId:string|undefined,value:CommercialPosterInput){
 const input=commercialPosterInputSchema.parse(value),asset=c.assets.find(a=>a.id===assetId);
 if(!asset||asset.kind!=='hero'||!c.brandProfile||!c.direction)throw new Error('Commercial Poster requires an existing Hero asset with saved Brand Profile, Creative Direction and prompt.');
 if((c.brandIntelligence?.draft&&!c.brandIntelligence.approved)||c.brandIntelligence?.conflicts.some(f=>f.status==='unresolved'))throw new Error('Approve brand rules and resolve brand conflicts first.');
 const reference=c.uploads.find(u=>u.id===input.sourceId&&u.role==='product');if(!reference)throw new Error('Select a stored product reference belonging to this campaign.');
 const request:ImageRequest={prompt:asset.prompt,brand:c.brandProfile,direction:c.direction,brandName:c.brandName,kind:'hero',width:input.width,height:input.height,version:Math.max(0,...asset.generations.map(g=>g.version))+1,references:[reference],commercialPoster:input};
 request.commercialPosterPrompt=posterPrompt(c,request);return {asset,request};
}
const graphSchema=z.record(z.object({class_type:z.string(),inputs:z.record(z.unknown())}));
export async function commercialPosterPlan(request:ImageRequest){
 const input=commercialPosterInputSchema.parse(request.commercialPoster);
 if(request.kind!=='hero'||request.width!==input.width||request.height!==input.height)throw new Error('Commercial Poster supports only Hero 880×592.');
 if(request.styleReference||request.conditioningStrength||request.productHero)throw new Error('Commercial Poster supports one native product reference; no style, strength or Product Hero controls.');
 const ref=request.references.find(r=>r.id===input.sourceId&&r.role==='product');
 if(!ref||!['image/png','image/jpeg','image/webp'].includes(ref.mime))throw new Error('A stored PNG/JPEG/WebP product reference is required.');
 let source:Buffer;try{source=await storage.get(ref.id);}catch{throw new Error('Product reference is missing from storage.');}
 const bytes=await validateReferenceImage(source,'native');
 let template:unknown;try{template=JSON.parse(await readFile('comfyui/workflows/commercial_poster_v1.json','utf8'));}catch{throw new Error('Commercial Poster workflow template is missing or invalid.');}
 const definition=getWorkflow('commercial_poster_v1','1.0.0');if(templateHash(template)!==definition.templateHash)throw new Error('Commercial Poster template hash mismatch. Register a reviewed version.');
 const graph=graphSchema.parse(template),positive=request.commercialPosterPrompt?.trim();if(!positive)throw new Error('Commercial Poster requires the saved campaign prompt adapter output.');
 graph['74'].inputs.text=positive;graph['200'].inputs.image='pending.png';graph['73'].inputs.noise_seed=input.seed;
 for(const id of ['62','66']){graph[id].inputs.width=input.width;graph[id].inputs.height=input.height;}
 graph['9'].inputs.filename_prefix='creativeflow_klein_'+randomUUID();
 return {input,bytes,template,graph,definition,positive,sourceSha256:createHash('sha256').update(source).digest('hex')};
}
export function requireKleinDependencies(catalog:Catalog){const result=checkDependencies(getWorkflow('commercial_poster_v1','1.0.0'),{},catalog);if(result.missing.length)throw new Error('Commercial Poster unavailable: '+result.missing.join('; '));}
export async function generateCommercialPoster(request:ImageRequest,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<ImageResult>{
 return measure('comfyui','image','comfyui_generation',kleinModel,async()=>{
  const start=Date.now();captureLocal({workflow:'commercial_poster_v1',checkpoint:kleinModel,width:880,height:592,plannedRefinementPasses:0,completedRefinementPasses:0});
  const plan=await commercialPosterPlan(request),transport=productTransport(kleinEnvironment(env),fetcher,'Commercial Poster'),catalog=await transport.catalog();requireKleinDependencies(catalog);
  await executionCheckpoint();await request.onStage?.('Preparing references');plan.graph['200'].inputs.image=await transport.upload(plan.bytes);
  const reproducibility=recordReproducibility({mode:'commercial_poster_v1',template:plan.template,graph:plan.graph,width:plan.input.width,height:plan.input.height,catalog,references:[{id:plan.input.sourceId,role:'product',strength:null,weightType:'native_reference_latent',sha256:plan.sourceSha256}]});
  await executionCheckpoint();await request.onStage?.('Commercial poster generation');const output=await transport.run(plan.graph);
  // Once queued, persist a completed image before honoring cancellation. Never start review.
  await executionFence();await request.onStage?.('Saving output');const info=await sharp(output,{limitInputPixels:40000000}).metadata();if(info.format!=='png'||info.width!==880||info.height!==592)throw new Error('Commercial Poster returned invalid output dimensions or format.');
  const name=randomUUID()+'.png';await storage.putGenerated(name,output);
  return {provider:'comfyui',imageUrl:'/api/generated/'+name,reproducibility,commercialPoster:{input:plan.input,promptAdapter:'klein-poster-v1',positivePrompt:plan.positive,sourceSha256:plan.sourceSha256,durationMs:Date.now()-start,reviewStatus:'not_requested',status:'experimental'}};
 });
}
