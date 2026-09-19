// Frozen three-seed development run. Default: prepare only. No tuning or refinement.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {createJob,getJob} from '../lib/jobs/store';
import {commercialPosterRequest} from '../lib/commercial-poster/pipeline';
import {commercialPosterInputSchema} from '../types/commercial-poster';
import {benchmarkFixtureSchema,benchmarkResultSchema} from '../types/benchmark';
import {dryRunBenchmark,saveBenchmarkResult,fixtureChecksum} from '../lib/workflows/benchmark';
import {templateHash} from '../lib/workflows/hash';
const root='storage/benchmarks/klein-stability-20260919';
const hash=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
async function main(){
 const original=JSON.parse(await readFile('external/klein-validation/creativeflow-integration-result.json','utf8'));
 const c=(await getCampaign(original.campaignId))!,a=c.assets.find(a=>a.id===original.assetId)!,g=a.generations.find(g=>g.id===original.generation.id)!;
 const meta=g.context!.commercialPoster!,r=g.context!.reproducibility!;
 if(templateHash(JSON.parse(await readFile('comfyui/workflows/commercial_poster_v1.json','utf8')))!==r.templateHash)throw new Error('Baseline template changed.');
 const request=commercialPosterRequest(c,a.id,meta.input).request;
 if(request.commercialPosterPrompt!==meta.positivePrompt)throw new Error('Current context differs from frozen integration prompt.');
 const source=await readFile('storage/uploads/'+meta.input.sourceId);if(hash(source)!==meta.sourceSha256)throw new Error('Reference changed.');
 const fixture=benchmarkFixtureSchema.parse({id:'midnight-pulse-klein-stability-20260919',version:1,category:'commercial_poster',campaignBrief:c.brief,placement:'hero',fixedPrompt:{positive:meta.positivePrompt,negative:''},seeds:[20260919,20260920,20260921],references:[{id:meta.input.sourceId,role:'product',file:'storage/uploads/'+meta.input.sourceId,sha256:meta.sourceSha256}],expectedWorkflow:{id:r.workflowId,version:r.workflowVersion},outputSize:r.resolution,evaluationCriteria:['Existing eight creative dimensions and defect penalty policy v2','Composition and product visibility >=75 (existing good band), no composition/product-prominence blocker','Exact product fidelity assessed against source; separate from composition'],blockerDefinitions:['Existing medium/high Vision blocking defects','Medium/high reference-identity defects'],humanReviewChecklist:['Focal hierarchy, copy space, prominence, scene coherence','Lighting, reflection, shadow, realism, background','Silhouette, resemblance, structural drift, redesign, invented details','Text, geometry, artifacts'],limitations:['Three seeds, one product and campaign; not statistical evidence.','Reuse prior seed: runtime/cache/GPU conditions may differ.','Assistant visual observations are not human approval.']});
 await mkdir(root,{recursive:true});
 const writeOnce=async(file:string,value:unknown)=>{try{await writeFile(root+'/'+file,JSON.stringify(value,null,2),{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}};
 await writeOnce('fixture.json',fixture);
 if(fixtureChecksum(JSON.parse(await readFile(root+'/fixture.json','utf8')))!==fixtureChecksum(fixture))throw new Error('Frozen fixture mismatch.');
 await writeOnce('baseline.json',{campaignId:c.id,assetId:a.id,generationId:g.id,workflow:r,brand:c.brandProfile,direction:c.direction,sourceSha256:meta.sourceSha256,promptSha256:hash(meta.positivePrompt),visionModel:process.env.VISION_MODEL||'gpt-4.1',rubric:'component-mean-with-defect-penalties-v2',fidelityRubric:'source-product-fidelity-v1'});
 const preflight=await dryRunBenchmark(fixture,{inspectDependencies:true,env:{...process.env,COMFYUI_URL:process.env.COMFYUI_KLEIN_URL}});if(!preflight.validation.valid)throw new Error(preflight.validation.issues.join('; '));
 console.log('Frozen template',r.templateHash,'seeds',fixture.seeds);
 if(!process.argv.includes('--generate'))return;
 const attempts=[{seed:20260919,generation:g,usage:original.usage,gpu:original.gpu,reused:true}];
 for(const seed of fixture.seeds.slice(1)){
  await writeFile(root+'/seed-'+seed+'-started.json',JSON.stringify({seed,startedAt:new Date().toISOString()}),{flag:'wx'});
  const current=(await getCampaign(c.id))!;
  if(commercialPosterRequest(current,a.id,meta.input).request.commercialPosterPrompt!==meta.positivePrompt)throw new Error('Prompt changed between seeds.');
  const job=await createJob({campaignId:c.id,assetId:a.id,commercialPoster:commercialPosterInputSchema.parse({...meta.input,seed}),requestKey:'klein-stability-20260919-'+seed});
  const samples:{at:string;memoryMiB:number}[]=[];let busy=false;
  const sample=()=>{if(busy)return;busy=true;execFile('nvidia-smi',['--query-gpu=memory.used','--format=csv,noheader,nounits'],{windowsHide:true},(err,out)=>{busy=false;if(!err)samples.push({at:new Date().toISOString(),memoryMiB:Number(out.trim())});});};sample();const timer=setInterval(sample,500),start=Date.now();
  let finished=await getJob(job.id);try{while(['queued','running','cancel_requested'].includes(finished.status)){if(Date.now()-start>660000)throw new Error('Worker wait timeout; do not resubmit.');await delay(500);finished=await getJob(job.id);}}finally{clearInterval(timer);}
  const fresh=(await getCampaign(c.id))!,generation=fresh.assets.find(x=>x.id===a.id)!.generations.find(x=>x.jobId===job.id),usage=await db.usageEvent.findMany({where:{jobId:job.id}});
  const record={seed,generation,job:finished,usage,gpu:{samples,observedMaxMiB:samples.length?Math.max(...samples.map(s=>s.memoryMiB)):null,scope:'sampled global GPU memory including other processes'},reused:false};await writeOnce('seed-'+seed+'.json',record);
  if(finished.status!=='completed'||!generation?.context?.commercialPoster)throw new Error('Generation failed; stopping without retries.');
  if(generation.context.commercialPoster.positivePrompt!==meta.positivePrompt||generation.context.reproducibility?.templateHash!==r.templateHash)throw new Error('Generated baseline mismatch.');
  attempts.push({...record,generation});console.log('Completed',seed,'V'+generation.version,'duration',usage[0]?.durationMs,'VRAM',record.gpu.observedMaxMiB);
 }
 const results=[];for(const attempt of attempts){const generation=attempt.generation!,repro=generation.context!.reproducibility!;
  const result=benchmarkResultSchema.parse({...preflight,id:randomUUID(),createdAt:new Date().toISOString(),execution:'measured',seed:attempt.seed,reproducibility:repro,dependencies:[repro.dependencies],metrics:{generation:'success',durationMs:attempt.usage[0].durationMs,vision:null,blockerCount:null,blockerCategories:null,humanReview:'not_reviewed',refinementCount:0,dependencyFailure:false,oomFailure:false,productFidelity:null},notes:['Three-seed development stability benchmark; no tuning or automatic refinement.','Generation '+generation.id+'; version '+generation.version+'; output '+generation.imageUrl,attempt.reused?'Reused successful integration seed; no new generation.':'One new local generation.','Observed sampled global VRAM MiB: '+attempt.gpu.observedMaxMiB]});results.push({seed:attempt.seed,generationId:generation.id,version:generation.version,imageUrl:generation.imageUrl,resultFile:await saveBenchmarkResult(result),durationMs:result.metrics.durationMs,gpu:attempt.gpu,reused:attempt.reused});}
 await writeOnce('generation-set.json',results);console.log(JSON.stringify(results.map(({gpu,...s})=>({...s,peakMiB:gpu.observedMaxMiB}))));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
