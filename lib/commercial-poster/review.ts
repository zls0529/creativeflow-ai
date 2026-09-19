import 'server-only';
import {withCampaignLock} from '@/lib/agents/orchestrator';
import {getCampaign} from '@/lib/database/campaigns';
import {db} from '@/lib/database/client';
import {saveEvaluation} from '@/lib/database/evaluations';
import {getVisionProvider} from '@/lib/providers';
import {withUsageScope} from '@/lib/usage/capture';
import type {VisionProvider} from '@/lib/providers/vision/base';
export async function reviewPoster(campaignId:string,generationId:string,provider?:VisionProvider){
 return withCampaignLock(campaignId,async()=>{
  const c=await getCampaign(campaignId),asset=c?.assets.find(a=>a.generations.some(g=>g.id===generationId)),g=asset?.generations.find(g=>g.id===generationId),poster=g?.context?.commercialPoster;
  if(!c?.brandProfile||!c.direction||!asset||!g?.imageUrl||!poster)throw new Error('A saved Commercial Poster with strategy is required.');
  if(g.evaluation)return g.evaluation;
  if(!c.uploads.some(u=>u.id===poster.input.sourceId&&u.role==='product'))throw new Error('The original product reference is unavailable.');
  if(await db.usageEvent.count({where:{generationId,category:'vision'}}))throw new Error('A Vision attempt is already recorded. Inspect usage before explicitly retrying outside this one-review action.');
  const vision=provider??getVisionProvider();if(vision.name!=='openai')throw new Error('Real poster review requires VISION_PROVIDER=openai.');
  const evaluation=await withUsageScope({assetId:asset.id,generationId,routing:g.context?.routing},()=>vision.evaluate({imageUrl:g.imageUrl,posterReference:{id:poster.input.sourceId,sha256:poster.sourceSha256},prompt:g.prompt,brand:c.brandProfile!,direction:c.direction!,brandConstraints:g.context?.brandConstraints,objective:c.objective,placement:asset.kind,version:g.version,iteration:0}));
  await saveEvaluation(g.id,vision.name,evaluation);
  const context={...g.context,stopReason:'One real reference-aware Vision review saved. Awaiting human decision; no automatic refinement.'};
  await db.generation.update({where:{id:g.id},data:{prompt:JSON.stringify({...g.prompt,_generation:context}),status:'evaluated'}});
  return evaluation;
 });
}
