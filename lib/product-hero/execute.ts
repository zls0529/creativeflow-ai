import 'server-only';
import {withCampaignLock} from '@/lib/agents/orchestrator';
import {getCampaign} from '@/lib/database/campaigns';
import {db} from '@/lib/database/client';
import {saveEvaluation} from '@/lib/database/evaluations';
import {guardBrand} from '@/lib/brand/conflicts';
import {getProviders,type Providers} from '@/lib/providers';
import {controlledProviders} from '@/lib/jobs/control-providers';
import {executionContext,executionCheckpoint,JobCancelledError,JobLeaseLostError} from '@/lib/jobs/context';
import {withUsageScope} from '@/lib/usage/capture';
import {safeJobMessage} from '@/lib/jobs/errors';
import type {ProductHeroInput} from '@/types/product-hero';
import type {GenerationContext} from '@/types/refinement';
import {productHeroRequest} from './pipeline';
import {SegmentationError} from './segmentation-store';
export async function executeProductHero(campaignId:string,assetId:string,input:ProductHeroInput,progress:(stage:string,message:string)=>Promise<void>,override?:Providers){
 return withCampaignLock(campaignId,async()=>{
  const c=await getCampaign(campaignId);if(!c)throw new Error('Campaign unavailable.');const {asset,request}=productHeroRequest(c,assetId,input),execution=executionContext.getStore();if(!execution)throw new Error('Product Hero requires a durable job.');
  const p=controlledProviders(override??getProviders());if(p.image.name!=='comfyui'||p.vision.name!=='openai')throw new Error('Product Hero requires real image and reference-aware Vision providers.');
  const saved=asset.generations.find(g=>g.jobId===execution.jobId&&g.context?.productHero&&g.imageUrl),previous=asset.generations.at(-1);
  const metadata:GenerationContext=saved?.context??{routing:execution.routing?.find(r=>r.placement===asset.kind),workflowMode:'product_hero_v1',workflowReason:'Explicit product preservation workflow',previousGenerationId:previous?.id??null,previousVersion:previous?.version??null,refinementIndex:0,targetedCorrections:[],brandConstraints:c.brandIntelligence?.approved??undefined};
  const encode=()=>JSON.stringify({...request.prompt,_generation:metadata});
  const generation=saved?await db.generation.findUniqueOrThrow({where:{id:saved.id}}):await db.generation.create({data:{assetId,version:request.version,imageUrl:'',provider:p.image.name,prompt:encode(),status:'generating',jobId:execution.jobId,jobAttempt:execution.attempt,reason:'Product Hero v1 — preserve source product pixels'}});
  await db.campaign.update({where:{id:campaignId},data:{status:'running',error:null}});await db.campaignAsset.update({where:{id:assetId},data:{status:'generating',width:request.width,height:request.height}});
  let phase='image';
  try{await withUsageScope({assetId,generationId:generation.id},async()=>{
   if(!saved){await guardBrand(campaignId,p.llm,metadata.brandConstraints,'prompt',{prompt:request.prompt,background:input.backgroundDirection});
    const result=await p.image.generate({...request,onStage:s=>progress(s,'Product Hero v1 · '+s)});
    if(!result.productHero||!result.reproducibility||result.productHero.fidelity.coreChangedPixels!==0)throw new Error('Product Hero provider returned no preservation evidence.');
    metadata.productHero=result.productHero;metadata.segmentation=result.productHero.segmentation.report;metadata.reproducibility=result.reproducibility;
    await db.generation.update({where:{id:generation.id},data:{imageUrl:result.imageUrl,provider:result.provider,status:'generated',prompt:encode()}});
   }
   await executionCheckpoint();phase='vision';
   if(!saved?.evaluation){await progress('Vision Review','Comparing original product reference and composited output.');const stored=await db.generation.findUniqueOrThrow({where:{id:generation.id}}),evaluation=await p.vision.evaluate({imageUrl:stored.imageUrl,prompt:request.prompt,brand:request.brand,direction:request.direction,objective:c.objective,placement:asset.kind,version:generation.version,iteration:0,brandConstraints:metadata.brandConstraints,productHero:metadata.productHero});
    if(!evaluation.productFidelity)throw new Error('Reference-aware Vision returned no product fidelity findings.');
    metadata.productHero!.review=evaluation.productFidelity;metadata.productHero!.visionProvider=p.vision.name;await saveEvaluation(generation.id,p.vision.name,evaluation);
   }else{metadata.productHero!.review=saved.evaluation.productFidelity;metadata.productHero!.visionProvider=saved.evaluation.provider??'not_recorded';}
   await executionCheckpoint();metadata.stopReason='Experimental Product Hero saved. Review source, mask and findings; no automatic refinement or approval.';
   await db.generation.update({where:{id:generation.id},data:{status:'evaluated',prompt:encode()}});await db.campaignAsset.update({where:{id:assetId},data:{status:'needs_review'}});await db.campaign.update({where:{id:campaignId},data:{status:'completed',error:null}});await progress('Human Review Ready',metadata.stopReason);
  });}catch(e){if(e instanceof SegmentationError)metadata.segmentation=e.report;if(e instanceof JobLeaseLostError)throw e;const cancelled=e instanceof JobCancelledError;metadata.error=cancelled?undefined:safeJobMessage(e);await db.generation.update({where:{id:generation.id},data:{prompt:encode(),...(!cancelled?{status:phase==='image'?'image_failed':'evaluation_failed'}:{})}});await db.campaignAsset.update({where:{id:assetId},data:{status:cancelled?'pending':'failed'}});await db.campaign.update({where:{id:campaignId},data:{status:cancelled?'cancelled':'failed',error:cancelled?null:safeJobMessage(e)}});throw e;}
 });
}
