import {executeRouted} from '@/lib/workflows/execute-routed';
import {executeCommercialPoster} from '@/lib/commercial-poster/execute';
import {executeProductHero} from '@/lib/product-hero/execute';
import {executeRepair} from '@/lib/repair/execute';
import {UsageLimitError} from '@/lib/usage/capture';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/database/client';
import {getCampaign} from '@/lib/database/campaigns';
import {checkReadiness,ReadinessBlockedError} from '@/lib/readiness';
import {runCampaign} from '@/lib/agents/orchestrator';
import type {Providers} from '@/lib/providers';
import type {ReadinessReport} from '@/types/readiness';
import {jobInputSchema} from '@/types/jobs';
import {claimJob,finishJob,heartbeat,recoverStaleJobs} from './store';
import {executionContext,JobCancelledError,JobLeaseLostError} from './context';
import {safeJobMessage} from './errors';

export interface ExecutorOptions {
 owner?:string;
 providers?:Providers;
 preflight?:(campaign:NonNullable<Awaited<ReturnType<typeof getCampaign>>>,input:ReturnType<typeof jobInputSchema.parse>)=>Promise<ReadinessReport>;
}
/** Queue adapter boundary: claim one persisted job, then invoke the existing orchestrator. */
export async function workOnce(options:ExecutorOptions={}){
 await recoverStaleJobs();const owner=options.owner??randomUUID(),job=await claimJob(owner);if(!job)return false;
 let lost=false,heartbeatBusy=false;
 const fence=async()=>{if(lost||!await db.executionJob.findFirst({where:{id:job.id,owner,leaseUntil:{gt:new Date()}}}))throw new JobLeaseLostError();};
 const checkpoint=async()=>{await fence();const row=await db.executionJob.findUniqueOrThrow({where:{id:job.id}});if(row.cancelRequestedAt)throw new JobCancelledError();};
 const timer=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;void heartbeat(job.id,owner).then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;}).finally(()=>{heartbeatBusy=false;});},5000);timer.unref();
 const progress=async(stage:string,message:string)=>{
  await db.$transaction(async tx=>{const updated=await tx.executionJob.updateMany({where:{id:job.id,owner,leaseUntil:{gt:new Date()}},data:{stage,message:safeJobMessage(message)}});if(!updated.count)throw new JobLeaseLostError();await tx.jobEvent.create({data:{jobId:job.id,attempt:job.attempt,stage,message:safeJobMessage(message)}});});
 };
 try{
  await executionContext.run({jobId:job.id,attempt:job.attempt,checkpoint,fence},async()=>{
   await checkpoint();const input=jobInputSchema.parse({...JSON.parse(job.payload),requestKey:job.requestKey});const campaign=await getCampaign(job.campaignId);if(!campaign)throw new Error('Campaign no longer exists.');
   await progress('Preflight','Checking required providers, workflow and references.');
   executionContext.getStore()!.routing=input.routing;
   const report=options.preflight?await options.preflight(campaign,input):await checkReadiness({routing:input.routing,workflowOverride:input.workflowOverride,campaign,assetId:input.assetId,refine:!!input.instruction,conditioningStrength:input.conditioningStrength,repair:input.repair,productHero:input.productHero,commercialPoster:input.commercialPoster});
   if(!report.canGenerate)throw new ReadinessBlockedError(report);
   await checkpoint();
   await db.$transaction(async tx=>{const started=await tx.executionJob.updateMany({where:{id:job.id,owner,status:'queued',cancelRequestedAt:null},data:{status:'running',startedAt:new Date(),message:'Preflight passed. Generation started.'}});if(!started.count)throw new JobCancelledError();await tx.jobAttempt.update({where:{jobId_number:{jobId:job.id,number:job.attempt}},data:{status:'running',startedAt:new Date()}});});
   await progress('Preflight','Preflight passed. Generation started.');
   if(input.routing?.length)await executeRouted(input,progress,options.providers);
   else if(input.commercialPoster)await executeCommercialPoster(job.campaignId,input.assetId!,input.commercialPoster,progress,options.providers);
   else if(input.productHero)await executeProductHero(job.campaignId,input.assetId!,input.productHero,progress,options.providers);
   else if(input.repair)await executeRepair(job.campaignId,input.assetId!,input.repair,progress,options.providers);
   else await runCampaign(job.campaignId,async event=>{await progress(event.stage,event.status==='running'?event.message:`Stage ${event.status}. ${event.message}`);},input.assetId?{assetId:input.assetId,instruction:input.instruction}:undefined,options.providers,input.conditioningStrength);
   await checkpoint();
  });
  await finishJob(job.id,owner,'completed','Job completed. Outputs are ready for human review; quality findings remain in their evaluations.');
 }catch(e){
  if(!(e instanceof JobLeaseLostError))await finishJob(job.id,owner,e instanceof JobCancelledError?'cancelled':'failed',safeJobMessage(e),e instanceof UsageLimitError?'cost_limit':e instanceof ReadinessBlockedError?'preflight_blocked':e instanceof JobCancelledError?'cancelled':'execution_failed');
 }finally{clearInterval(timer);}
 return true;
}
