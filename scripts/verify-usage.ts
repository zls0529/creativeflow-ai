import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {checkReadiness} from '../lib/readiness';
import {createJob,getJob} from '../lib/jobs/store';
import {workOnce} from '../lib/jobs/executor';
import {usageReport,exportUsage} from '../lib/usage/report';

async function main(){
 if(process.argv[2]!=='--live')throw new Error('This manual verification requires --live and uses paid OpenAI calls plus one local generation.');
 if(process.env.LLM_PROVIDER!=='openai'||process.env.VISION_PROVIDER!=='openai'||process.env.IMAGE_PROVIDER!=='comfyui')throw new Error('Configure real providers before this manual verification.');
 if(await db.executionJob.count({where:{status:{in:['queued','running','cancel_requested']}}}))throw new Error('Wait for existing jobs before manual verification.');
 const campaignId=process.argv[3];if(!campaignId)throw new Error('Supply an existing campaign ID with a reviewed product asset.');
 const c=await getCampaign(campaignId),asset=c?.assets.find(a=>a.kind==='product'&&a.generations.at(-1)?.evaluation);
 if(!c||!asset)throw new Error('Campaign requires an existing reviewed product asset.');
 process.env.MAX_REFINEMENTS='0'; // Only this verification process; no persisted settings changed.
 const report=await checkReadiness({campaign:c,assetId:asset.id,refine:true});
 if(!report.canGenerate){console.log(JSON.stringify({livePerformed:false,readiness:report},null,2));return;}
 const old=await db.generation.findMany({where:{asset:{campaignId}},select:{id:true,prompt:true,imageUrl:true,evaluation:{select:{data:true}}}});
 const before=await db.usageEvent.count({where:{campaignId}});
 const job=await createJob({campaignId,assetId:asset.id,instruction:'Keep the existing product concept and campaign palette. Make the product silhouette and complete base clearly readable with a simple background.',requestKey:randomUUID()});
 console.log('Manual usage job queued: '+job.id);
 await workOnce();
 const saved=await getJob(job.id),usage=await usageReport({jobId:job.id}),campaign=await usageReport({campaignId});
 const unchanged=await db.generation.findMany({where:{id:{in:old.map(g=>g.id)}},select:{id:true,prompt:true,imageUrl:true,evaluation:{select:{data:true}}}});
 assert.deepEqual(unchanged.sort((a,b)=>a.id.localeCompare(b.id)),old.sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal(campaign.eventCount,before+usage.eventCount);
 const exported=await exportUsage({jobId:job.id});
 assert.ok(!process.env.OPENAI_API_KEY||!exported.includes(process.env.OPENAI_API_KEY));
 const result={verifiedAt:new Date().toISOString(),campaignId,assetId:asset.id,jobId:job.id,status:saved.status,failure:saved.failure,priorVersionsUnchanged:true,events:usage.events,totals:usage.totals,manualScope:'One product refinement job; automatic additional refinements disabled for this process only.'};
 await writeFile('docs/usage-verification.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({jobId:job.id,status:saved.status,failure:saved.failure,totals:usage.totals},null,2));
 assert.equal(saved.status,'completed');assert.ok(usage.events.some(e=>e.provider==='openai'&&e.category==='text'&&e.inputTokens!==null));assert.ok(usage.events.some(e=>e.provider==='openai'&&e.category==='vision'&&e.inputTokens!==null));assert.equal(usage.totals.localCompleted,1);
}
main().catch(()=>{console.error('Usage verification did not complete. Inspect the saved job and sanitized verification report.');process.exitCode=1;}).finally(()=>db.$disconnect());
