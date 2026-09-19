import 'server-only';
import {withCampaignLock} from '@/lib/agents/orchestrator';
import {getCampaign} from '@/lib/database/campaigns';
import {db} from '@/lib/database/client';
import {getImageProvider,type Providers} from '@/lib/providers';
import {executionContext,executionCheckpoint,executionFence,JobCancelledError,JobLeaseLostError} from '@/lib/jobs/context';
import {withUsageScope} from '@/lib/usage/capture';
import {withReproducibility} from '@/lib/workflows/reproducibility';
import {safeJobMessage} from '@/lib/jobs/errors';
import type {CommercialPosterInput} from '@/types/commercial-poster';
import type {GenerationContext} from '@/types/refinement';
import {commercialPosterRequest} from './pipeline';
export async function executeCommercialPoster(campaignId:string,assetId:string,input:CommercialPosterInput,progress:(stage:string,message:string)=>Promise<void>,override?:Providers){
 return withCampaignLock(campaignId,async()=>{
  const c=await getCampaign(campaignId);if(!c)throw new Error('Campaign unavailable.');const {asset,request}=commercialPosterRequest(c,assetId,input),execution=executionContext.getStore();if(!execution)throw new Error('Commercial Poster requires a durable job.');
  const image=override?.image??getImageProvider();if(image.name!=='comfyui')throw new Error('Commercial Poster requires ComfyUI.');
  const saved=asset.generations.find(g=>g.jobId===execution.jobId&&g.context?.commercialPoster&&g.imageUrl),previous=asset.generations.at(-1);
  const metadata:GenerationContext=saved?.context??{routing:execution.routing?.find(r=>r.placement===asset.kind),workflowMode:'commercial_poster_v1',workflowReason:'Explicit experimental Klein poster; no auto routing',previousGenerationId:previous?.id??null,previousVersion:previous?.version??null,refinementIndex:0,targetedCorrections:[],brandConstraints:c.brandIntelligence?.approved??undefined};
  const encode=()=>JSON.stringify({...request.prompt,_generation:metadata});
  const generation=saved?await db.generation.findUniqueOrThrow({where:{id:saved.id}}):await db.generation.create({data:{assetId,version:request.version,imageUrl:'',provider:image.name,prompt:encode(),status:'generating',jobId:execution.jobId,jobAttempt:execution.attempt,reason:'Commercial Poster — Klein v1 (experimental)'}});
  await db.campaign.update({where:{id:campaignId},data:{status:'running',error:null}});await db.campaignAsset.update({where:{id:assetId},data:{status:'generating',width:880,height:592}});
  try{await withUsageScope({assetId,generationId:generation.id},async()=>{
   if(!saved){await executionCheckpoint();const result=await withReproducibility(r=>{metadata.reproducibility=r;},()=>image.generate({...request,onStage:s=>progress(s,'Commercial Poster · '+s)}));await executionFence();
    if(!result.commercialPoster||!result.reproducibility||result.reproducibility.workflowId!=='commercial_poster_v1')throw new Error('Commercial Poster provider returned no reproducibility evidence.');
    metadata.commercialPoster=result.commercialPoster;metadata.reproducibility=result.reproducibility;
    await db.generation.update({where:{id:generation.id},data:{imageUrl:result.imageUrl,provider:result.provider,status:'generated',prompt:encode()}});
   }
   await executionCheckpoint();metadata.stopReason='Experimental Commercial Poster saved. Awaiting separately approved Vision review. No automatic review or refinement.';
   await db.generation.update({where:{id:generation.id},data:{prompt:encode()}});await db.campaignAsset.update({where:{id:assetId},data:{status:'needs_review'}});await db.campaign.update({where:{id:campaignId},data:{status:'completed',error:null}});await progress('Awaiting optional Vision review',metadata.stopReason);
  });}catch(e){if(e instanceof JobLeaseLostError)throw e;const cancelled=e instanceof JobCancelledError;metadata.error=cancelled?undefined:safeJobMessage(e);await db.generation.update({where:{id:generation.id},data:{prompt:encode(),...(!cancelled?{status:'image_failed'}:{})}});await db.campaignAsset.update({where:{id:assetId},data:{status:cancelled?'pending':'failed'}});await db.campaign.update({where:{id:campaignId},data:{status:cancelled?'cancelled':'failed',error:cancelled?null:safeJobMessage(e)}});throw e;}
 });
}
