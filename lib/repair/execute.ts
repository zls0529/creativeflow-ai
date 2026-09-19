import {withReproducibility} from '@/lib/workflows/reproducibility';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {guardBrand} from '@/lib/brand/conflicts';
import {db} from '@/lib/database/client';
import {getCampaign} from '@/lib/database/campaigns';
import {saveEvaluation} from '@/lib/database/evaluations';
import {withCampaignLock} from '@/lib/agents/orchestrator';
import {getProviders,type Providers} from '@/lib/providers';
import {controlledProviders} from '@/lib/jobs/control-providers';
import {executionContext,executionCheckpoint,JobCancelledError,JobLeaseLostError} from '@/lib/jobs/context';
import {safeJobMessage} from '@/lib/jobs/errors';
import {withUsageScope} from '@/lib/usage/capture';
import type {RepairRequest} from '@/types/repair';
import type {GenerationContext} from '@/types/refinement';
import {repairInput} from './input';
export async function executeRepair(campaignId:string,assetId:string,repair:RepairRequest,progress:(stage:string,message:string)=>Promise<void>,override?:Providers){
 return withCampaignLock(campaignId,async()=>{
  const c=await getCampaign(campaignId);if(!c)throw new Error('Repair campaign is unavailable.');const {asset,source,request}=repairInput(c,assetId,repair);
  const p=controlledProviders(override??getProviders());if(!p.image.repair)throw new Error('Selected provider does not support local repair. No full-image fallback.');
  const execution=executionContext.getStore();if(!execution)throw new Error('Repairs must run through a durable job.');
  // Retry reuses an image already saved by this job, never re-repairs the source unnecessarily.
  const saved=asset.generations.find(g=>g.jobId===execution.jobId&&g.context?.repair?.request.sourceGenerationId===source.id&&g.imageUrl);
  const metadata:GenerationContext=saved?.context??{workflowMode:repair.selection==='auto_face'?'face_repair':'inpaint_repair',workflowReason:'User-confirmed localized repair',previousGenerationId:source.id,previousVersion:source.version,refinementIndex:0,targetedCorrections:[repair.repairPrompt],brandConstraints:c.brandIntelligence?.approved??undefined,repair:{request:repair,sourceVersion:source.version,maskMethod:repair.selection==='auto_face'?'FaceDetailer / pending detection':'manual rectangle'}};
  const encode=()=>JSON.stringify({...source.prompt,_generation:metadata});
  if(!saved){metadata.repair!.maskId=randomUUID();request.maskId=metadata.repair!.maskId;}
  const generation=saved?await db.generation.findUniqueOrThrow({where:{id:saved.id}}):await db.generation.create({data:{assetId,version:Math.max(...asset.generations.map(g=>g.version))+1,prompt:encode(),imageUrl:'',provider:p.image.name,status:'generating',jobId:execution.jobId,jobAttempt:execution.attempt,reason:'Local repair: '+repair.targetType+' from V'+source.version+' — '+safeJobMessage(repair.repairReason)}});
  await db.campaign.update({where:{id:campaignId},data:{status:'running',error:null}});await db.campaignAsset.update({where:{id:assetId},data:{status:'generating'}});
  let phase='image';
  try{
   await withUsageScope({assetId,generationId:generation.id},async()=>{
    if(!saved){await guardBrand(campaignId,p.llm,metadata.brandConstraints,'prompt',{repairPrompt:repair.repairPrompt,negativeConstraints:repair.negativeConstraints});await progress('Local repair','Repairing '+repair.targetType+' from V'+source.version+'; source version is preserved.');const result=await withReproducibility(value=>{metadata.reproducibility=value;},()=>p.image.repair!(request));if(!result.repair?.maskId||!result.repair.outsideMaskUnchanged)throw new Error('Repair provider returned no verified mask preservation evidence.');metadata.reproducibility=result.reproducibility??metadata.reproducibility;metadata.repair=result.repair;metadata.detailPasses=result.detailPasses;metadata.referenceConditioning=result.referenceConditioning;await db.generation.update({where:{id:generation.id},data:{imageUrl:result.imageUrl,provider:result.provider,prompt:encode(),status:'generated'}});}
    await executionCheckpoint();phase='vision';
    if(p.vision.name!=='mock'&&!saved?.evaluation){await progress('Vision Review','Reviewing repaired image once. Human approval remains required.');const stored=await db.generation.findUniqueOrThrow({where:{id:generation.id}});const evaluation=await p.vision.evaluate({imageUrl:stored.imageUrl,brand:request.image.brand,direction:request.image.direction,prompt:source.prompt,placement:asset.kind,objective:c.objective,version:generation.version,iteration:0,brandConstraints:metadata.brandConstraints});await saveEvaluation(generation.id,p.vision.name,evaluation);}
    await executionCheckpoint();metadata.stopReason=p.vision.name==='mock'?'Local repair saved without real Vision evaluation; human review required.':'Local repair reviewed; compare source findings and new blockers before human approval.';await db.generation.update({where:{id:generation.id},data:{status:p.vision.name==='mock'?'generated':'evaluated',prompt:encode()}});await db.campaignAsset.update({where:{id:assetId},data:{status:'needs_review'}});await db.campaign.update({where:{id:campaignId},data:{status:'completed',error:null}});await progress('Human Review Ready',metadata.stopReason);
   });
  }catch(e){if(e instanceof JobLeaseLostError)throw e;const message=safeJobMessage(e);if(!(e instanceof JobCancelledError)){metadata.error=message;metadata.stopReason='Local repair stopped: '+phase+' failure.';await db.generation.update({where:{id:generation.id},data:{status:phase==='image'?'image_failed':'evaluation_failed',prompt:encode()}});}await db.campaignAsset.update({where:{id:assetId},data:{status:e instanceof JobCancelledError?'pending':'failed'}});await db.campaign.update({where:{id:campaignId},data:{status:e instanceof JobCancelledError?'cancelled':'failed',error:e instanceof JobCancelledError?null:message}});throw e;}
 });
}
