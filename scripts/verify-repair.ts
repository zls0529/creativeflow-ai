import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {createJob,getJob} from '../lib/jobs/store';
import {workOnce} from '../lib/jobs/executor';
import {checkRepairReadiness} from '../lib/repair/readiness';
import {sourceImage,maskPixels} from '../lib/repair/masks';
import {storage} from '../lib/storage';
import {repairOutcome} from '../lib/repair/guidance';
import {usageReport} from '../lib/usage/report';
import {repairRequestSchema} from '../types/repair';

async function main(){
 const live=process.argv.includes('--live');
 const campaignId='cmu416g9w0000v16gqandk68k',assetId='cmu416ga50006v16gz8pcmacq';
 const repair=repairRequestSchema.parse({sourceGenerationId:'cmu5fd34j0001v1owmce8g3o4',targetType:'shoe',selection:'manual',region:{x:0.625,y:0.505,width:0.125,height:0.16},repairPrompt:'Repair the raised rear shoe into one complete crisp realistic cyan running shoe with an intact sole and natural ankle connection. Preserve its existing silhouette, foot direction, cyan color, nighttime lighting and the runner identity.',negativeConstraints:'duplicated shoe, missing foot, twisted ankle, extra foot, changed shoe color',repairReason:'Saved Vision finding reports rear shoe motion blur and insufficient product clarity.',sourceCriticFindingId:'blocking:1',workflowMode:'inpaint_repair',userConfirmed:true,useProductReference:false});
 const c=await getCampaign(campaignId),asset=c?.assets.find(a=>a.id===assetId),source=asset?.generations.find(g=>g.id===repair.sourceGenerationId);
 assert.ok(c&&asset&&source);
 const readiness=await checkRepairReadiness(c,assetId,repair);
 const proposal={campaignId,assetId,sourceVersion:source.version,sourceScore:source.evaluation?.overall,repair,readiness};
 await writeFile('docs/repair-proposal.json',JSON.stringify(proposal,null,2));
 if(!live){console.log(JSON.stringify(proposal,null,2));return;}
 assert.equal(process.env.VISION_PROVIDER,'openai');assert.equal(readiness.canGenerate,true);
 assert.equal(await db.executionJob.count({where:{status:{in:['queued','running','cancel_requested']}}}),0);
 const old=await db.generation.findMany({select:{id:true,prompt:true,imageUrl:true,evaluation:{select:{data:true}}}});
 const before=await sourceImage(source.imageUrl),hash=createHash('sha256').update(before.bytes).digest('hex');
 const job=await createJob({campaignId,assetId,repair,requestKey:randomUUID()});console.log('Repair verification job: '+job.id);
 await workOnce();
 const status=await getJob(job.id),after=await getCampaign(campaignId),generation=after!.assets.find(a=>a.id===assetId)!.generations.find(g=>g.jobId===job.id),usage=await usageReport({jobId:job.id});
 const unchanged=await db.generation.findMany({where:{id:{in:old.map(g=>g.id)}},select:{id:true,prompt:true,imageUrl:true,evaluation:{select:{data:true}}}});
 assert.deepEqual(unchanged.sort((a,b)=>a.id.localeCompare(b.id)),old.sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal(createHash('sha256').update((await sourceImage(source.imageUrl)).bytes).digest('hex'),hash);
 let outsideChanged:number|null=null;
 if(generation?.imageUrl&&generation.context?.repair?.maskId){
  const repaired=await sharp((await sourceImage(generation.imageUrl)).bytes).ensureAlpha().raw().toBuffer();
  const original=await sharp(before.bytes).ensureAlpha().raw().toBuffer();
  const mask=await maskPixels(await storage.getRepairMask(generation.context.repair.maskId),before.width,before.height);
  outsideChanged=0;for(let p=0;p<before.width*before.height;p++)if(mask[p]===0&&original.subarray(p*4,p*4+4).compare(repaired.subarray(p*4,p*4+4))!==0)outsideChanged++;
 }
 const result={verifiedAt:new Date().toISOString(),jobId:job.id,status:status.status,failure:status.failure,sourceGenerationId:source.id,sourceVersion:source.version,repairGenerationId:generation?.id,repairVersion:generation?.version,sourceImageUrl:source.imageUrl,repairedImageUrl:generation?.imageUrl,repair:generation?.context?.repair,priorVersionsUnchanged:true,outsideMaskChangedPixels:outsideChanged,before:source.evaluation,after:generation?.evaluation,comparison:repairOutcome(source.evaluation,generation?.evaluation),usage};
 await writeFile('docs/repair-verification.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:status.status,failure:status.failure,before:source.evaluation?.overall,after:generation?.evaluation?.overall,outsideChanged,usage:usage.totals},null,2));
 assert.equal(status.status,'completed');assert.equal(outsideChanged,0);
}
main().catch(e=>{console.error(e instanceof assert.AssertionError?e.message:'Repair verification failed; inspect the sanitized proposal/job report.');process.exitCode=1;}).finally(()=>db.$disconnect());
