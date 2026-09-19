import 'server-only';
import {freezeRouting} from '@/lib/workflows/routing';
import {creativeSelectionSchema} from '@/types/creative-mode';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/database/client';
import {jobInputSchema,activeJobStates,type JobInput,type JobView} from '@/types/jobs';
import {JobConflictError,JobNotFoundError,safeJobMessage} from './errors';
import type {Prisma} from '@prisma/client';
export const JOB_LEASE_MS=120000;
export const WORKER_SLOT='local-generation';
const detail={attempts:{orderBy:{number:'asc' as const}},events:{orderBy:{createdAt:'asc' as const}}};
function view(j:Prisma.ExecutionJobGetPayload<{include:typeof detail}>):JobView {
 const date=(d:Date|null)=>d?.toISOString()??null;
 return {routing:JSON.parse(j.payload).routing,id:j.id,campaignId:j.campaignId,assetId:j.assetId,action:j.action,status:j.status,stage:j.stage,message:safeJobMessage(j.message),failure:j.failure?safeJobMessage(j.failure):null,failureCode:j.failureCode,attempt:j.attempt,retryCount:j.retryCount,createdAt:j.createdAt.toISOString(),startedAt:date(j.startedAt),completedAt:date(j.completedAt),cancelRequestedAt:date(j.cancelRequestedAt),attempts:j.attempts.map(a=>({number:a.number,status:a.status,failure:a.failure?safeJobMessage(a.failure):null,failureCode:a.failureCode,createdAt:a.createdAt.toISOString(),startedAt:date(a.startedAt),completedAt:date(a.completedAt)})),events:j.events.map(e=>({id:e.id,attempt:e.attempt,stage:e.stage,message:safeJobMessage(e.message),createdAt:e.createdAt.toISOString()}))};
}
export async function getJob(id:string){const j=await db.executionJob.findUnique({where:{id},include:detail});if(!j)throw new JobNotFoundError('Job not found.');return view(j);}
export async function listJobs(campaignId:string){return (await db.executionJob.findMany({where:{campaignId},include:detail,orderBy:{createdAt:'desc'},take:30})).map(view);}
export async function createJob(raw:JobInput){
 const input=jobInputSchema.parse(raw);delete input.routing;const {requestKey,...payload}=input;let encoded=JSON.stringify(payload);
 const id=await db.$transaction(async tx=>{
  const existing=await tx.executionJob.findUnique({where:{requestKey}});if(existing){if(JSON.stringify((({routing,...rest})=>{void routing;return rest;})(JSON.parse(existing.payload)))!==encoded)throw new JobConflictError('This request key was already used for a different action.');return existing.id;}
  const c=await tx.campaign.findUnique({where:{id:input.campaignId},include:{uploads:true,assets:true}});if(!c)throw new JobNotFoundError('Campaign not found.');
  if(input.assetId&&!await tx.campaignAsset.findFirst({where:{id:input.assetId,campaignId:c.id}}))throw new JobNotFoundError('Asset does not belong to this campaign.');
  if(input.repair&&!await tx.generation.findFirst({where:{id:input.repair.sourceGenerationId,assetId:input.assetId,asset:{campaignId:c.id},imageUrl:{not:''}}}))throw new JobNotFoundError('Repair source generation does not belong to this asset or has no image.');
  const routes=freezeRouting({...c,creative:c.creativeConfig?creativeSelectionSchema.parse(JSON.parse(c.creativeConfig)):undefined},input);
  if(routes){if(input.instruction&&routes.some(r=>['commercial_poster_v1','product_hero_v1'].includes(r.providerMode)))throw new Error('Selected workflow does not support automatic prompt refinement.');encoded=JSON.stringify({...payload,routing:routes});}
  const jobId=randomUUID();const reserved=await tx.campaign.updateMany({where:{id:c.id,activeJobId:null,lockAt:null},data:{activeJobId:jobId}});
  if(!reserved.count)throw new JobConflictError('This campaign already has an active job or operation. View its progress before starting another.');
  await tx.executionJob.create({data:{id:jobId,campaignId:c.id,assetId:input.assetId,action:input.commercialPoster?'commercial_poster':input.productHero?'product_hero':input.repair?'local_repair':input.instruction?'prompt_refinement':input.assetId?'asset_regeneration':'campaign_generation',payload:encoded,requestKey,attempts:{create:{number:1}},events:{create:{attempt:1,stage:'Queued',message:'Job queued. Waiting for the local worker.'}}}});return jobId;
 });return getJob(id);
}
export async function cancelJob(id:string){
 await db.$transaction(async tx=>{
  const j=await tx.executionJob.findUnique({where:{id}});if(!j)throw new JobNotFoundError('Job not found.');if(!activeJobStates.includes(j.status)||j.status==='cancel_requested')return;
  const immediate=j.status==='queued'&&!j.owner,now=new Date();
  await tx.executionJob.update({where:{id},data:{status:immediate?'cancelled':'cancel_requested',cancelRequestedAt:now,...(immediate?{completedAt:now,stage:'Cancelled'}:{}),message:immediate?'Cancelled before execution.':'Cancellation requested. An in-flight provider call may still finish; subsequent stages will stop.'}});
  await tx.jobEvent.create({data:{jobId:id,attempt:j.attempt,stage:immediate?'Cancelled':'Cancel requested',message:immediate?'Cancelled before execution.':'Cancellation requested; waiting for a safe stage boundary.'}});
  if(immediate){await tx.jobAttempt.update({where:{jobId_number:{jobId:id,number:j.attempt}},data:{status:'cancelled',completedAt:now}});await tx.campaign.updateMany({where:{id:j.campaignId,activeJobId:id},data:{activeJobId:null}});}
 });return getJob(id);
}
export async function retryJob(id:string,expectedAttempt:number){
 await db.$transaction(async tx=>{
  const j=await tx.executionJob.findUnique({where:{id}});if(!j)throw new JobNotFoundError('Job not found.');
  if(j.attempt!==expectedAttempt||!['failed','cancelled'].includes(j.status))throw new JobConflictError('This attempt cannot be retried. Refresh the job status; a retry may already be queued.');
  // A later operation may have changed the campaign. Resume only the most recent job.
  if(await tx.executionJob.findFirst({where:{campaignId:j.campaignId,createdAt:{gt:j.createdAt}}}))throw new JobConflictError('A newer campaign job exists. Start a new generation using the current campaign instead.');
  const reserved=await tx.campaign.updateMany({where:{id:j.campaignId,activeJobId:null,lockAt:null},data:{activeJobId:id}});if(!reserved.count)throw new JobConflictError('Another campaign operation is active.');
  await tx.executionJob.update({where:{id},data:{status:'queued',stage:'Queued',message:'Retry queued. Completed work will be reused where safe.',attempt:{increment:1},retryCount:{increment:1},owner:null,leaseUntil:null,heartbeatAt:null,startedAt:null,completedAt:null,cancelRequestedAt:null,failure:null,failureCode:null}});
  await tx.jobAttempt.create({data:{jobId:id,number:j.attempt+1}});await tx.jobEvent.create({data:{jobId:id,attempt:j.attempt+1,stage:'Queued',message:'Retry queued; prior attempt history preserved.'}});
 });return getJob(id);
}
export async function claimJob(owner:string,now=new Date()){
 return db.$transaction(async tx=>{
  await tx.workerLease.upsert({where:{id:WORKER_SLOT},create:{id:WORKER_SLOT},update:{}});
  const slot=await tx.workerLease.updateMany({where:{id:WORKER_SLOT,OR:[{owner:null},{leaseUntil:{lte:now}}]},data:{owner,leaseUntil:new Date(+now+JOB_LEASE_MS)}});if(!slot.count)return null;
  const j=await tx.executionJob.findFirst({where:{status:'queued',owner:null},orderBy:{createdAt:'asc'}});
  if(!j){await tx.workerLease.update({where:{id:WORKER_SLOT},data:{owner:null,leaseUntil:null}});return null;}
  const claimed=await tx.executionJob.updateMany({where:{id:j.id,status:'queued',owner:null},data:{owner,heartbeatAt:now,leaseUntil:new Date(+now+JOB_LEASE_MS),stage:'Preflight',message:'Checking provider readiness.'}});if(!claimed.count)throw new JobConflictError('Job was claimed concurrently.');
  return {...j,owner};
 });
}
export async function heartbeat(id:string,owner:string,now=new Date()){
 return db.$transaction(async tx=>{
  const where={id,owner,leaseUntil:{gt:now},status:{in:activeJobStates}},j=await tx.executionJob.findFirst({where});if(!j)return false;
  const slot=await tx.workerLease.updateMany({where:{id:WORKER_SLOT,owner,leaseUntil:{gt:now}},data:{leaseUntil:new Date(+now+JOB_LEASE_MS)}});if(!slot.count)return false;
  await tx.executionJob.updateMany({where,data:{heartbeatAt:now,leaseUntil:new Date(+now+JOB_LEASE_MS)}});
  await tx.campaign.updateMany({where:{id:j.campaignId,activeJobId:id,lockAt:{not:null}},data:{lockAt:now}});return true;
 });
}
export async function finishJob(id:string,owner:string,status:'completed'|'failed'|'cancelled',message:string,failureCode?:string){
 return db.$transaction(async tx=>{
  const j=await tx.executionJob.findFirst({where:{id,owner,leaseUntil:{gt:new Date()},status:{in:activeJobStates}}});if(!j)return false;
  if(j.cancelRequestedAt&&status==='completed'){status='cancelled';message='Cancellation acknowledged after the current stage completed. Saved results were retained.';failureCode='cancelled';}
  const now=new Date(),safe=safeJobMessage(message),stage=status==='completed'?'Human Review Ready':status==='cancelled'?'Cancelled':'Failed';
  await tx.executionJob.update({where:{id},data:{status,stage,message:safe,failure:status==='failed'?safe:null,failureCode:failureCode??null,completedAt:now,owner:null,leaseUntil:null}});
  await tx.jobAttempt.update({where:{jobId_number:{jobId:id,number:j.attempt}},data:{status,completedAt:now,failure:status==='failed'?safe:null,failureCode:failureCode??null}});
  await tx.jobEvent.create({data:{jobId:id,attempt:j.attempt,stage,message:safe}});
  await tx.campaign.updateMany({where:{id:j.campaignId,activeJobId:id},data:{activeJobId:null,lockAt:null}});
  await tx.workerLease.updateMany({where:{id:WORKER_SLOT,owner},data:{owner:null,leaseUntil:null}});return true;
 });
}
export async function recoverStaleJobs(now=new Date()){
 return db.$transaction(async tx=>{
  const jobs=await tx.executionJob.findMany({where:{status:{in:activeJobStates},owner:{not:null},leaseUntil:{lte:now}}});
  for(const j of jobs){
   const message='Job interrupted: worker heartbeat expired, possibly after a server restart. Saved outputs were retained. Check any external provider queue before Retry.';
   await tx.executionJob.update({where:{id:j.id},data:{status:'failed',stage:'Interrupted',message,failure:message,failureCode:'interrupted',owner:null,leaseUntil:null,completedAt:now}});
   await tx.jobAttempt.update({where:{jobId_number:{jobId:j.id,number:j.attempt}},data:{status:'failed',failure:message,failureCode:'interrupted',completedAt:now}});
   await tx.jobEvent.create({data:{jobId:j.id,attempt:j.attempt,stage:'Interrupted',message}});
   await tx.campaign.updateMany({where:{id:j.campaignId,activeJobId:j.id},data:{activeJobId:null,lockAt:null,status:'failed',error:message}});
   await tx.agentRun.updateMany({where:{campaignId:j.campaignId,status:'running'},data:{status:'failed',message:'Worker interrupted; job is retryable.'}});
   await tx.campaignAsset.updateMany({where:{campaignId:j.campaignId,status:'generating'},data:{status:'failed'}});
   await tx.generation.updateMany({where:{jobId:j.id,status:'generating'},data:{status:'interrupted'}});
  }
  await tx.workerLease.updateMany({where:{id:WORKER_SLOT,leaseUntil:{lte:now}},data:{owner:null,leaseUntil:null}});return jobs.length;
 });
}
