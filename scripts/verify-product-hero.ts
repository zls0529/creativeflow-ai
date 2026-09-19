// Default is read-only preparation. --run is for a separately authorized single live job.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {storage} from '../lib/storage';
import {productHeroInputSchema} from '../types/product-hero';
import {benchmarkFixtureSchema,benchmarkResultSchema} from '../types/benchmark';
import {checkProductHeroReadiness} from '../lib/product-hero/readiness';
import {productHeroPlan,productHeroRequest} from '../lib/product-hero/pipeline';
import {createJob,getJob} from '../lib/jobs/store';
import {dryRunBenchmark,fixtureChecksum,saveBenchmarkResult} from '../lib/workflows/benchmark';
import {usageReport} from '../lib/usage/report';
const manifestSchema=z.object({fixture:benchmarkFixtureSchema,campaignId:z.string(),assetId:z.string(),input:productHeroInputSchema,status:z.literal('prepared_not_executed')});
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--prepare','--run','--approved-live','--verified-rmbg'].includes(a)))throw new Error('Unknown argument.');
 const verifiedRmbg=args.includes('--verified-rmbg');
 const live=args.includes('--run');if(live&&!args.includes('--approved-live'))throw new Error('Live verification requires explicit user approval before --run --approved-live.');
 const manifest=manifestSchema.parse(JSON.parse(await readFile('benchmarks/product-hero-v1.json','utf8'))),c=await getCampaign(manifest.campaignId);if(!c)throw new Error('Prepared campaign is unavailable.');
 if(verifiedRmbg){if(process.env.COMFYUI_PRODUCT_HERO_REMBG!=='rmbg14'||!process.env.COMFYUI_LOCAL_ROOT)throw new Error('Verified RMBG requires the installed-model configuration in both this process and the worker.');manifest.input.segmentation='background_removal';}
 const bytes=await storage.get(manifest.input.sourceId);if(createHash('sha256').update(bytes).digest('hex')!==manifest.fixture.references[0].sha256)throw new Error('Stored product does not match frozen benchmark source.');
 const report=await checkProductHeroReadiness(c,manifest.assetId,manifest.input),{request}=productHeroRequest(c,manifest.assetId,manifest.input),plan=await productHeroPlan(request,process.env);
 // This is a B01-derived smoke case on the existing campaign, not an exact
 // replay of the research brief. Hash the actual submitted context and settings.
 const effectiveFixture={...manifest.fixture,id:'B01-PH1-smoke',campaignBrief:JSON.stringify({brief:c.brief,brand:request.brand,direction:request.direction,prompt:request.prompt,productHero:manifest.input}),fixedPrompt:plan.prompts,seeds:[manifest.input.seed]};
 const prepared={mode:'prepare_only',campaign:c.name,assetId:manifest.assetId,input:manifest.input,sourceSha256:plan.sourceSha256,backgroundPrompt:plan.prompts,effectiveFixture,readiness:report,paidCallsMade:0,generatedImages:0};
 if(!live){console.log(JSON.stringify(prepared,null,2));return;}
 if(!report.canGenerate)throw new Error('Product Hero preflight failed. No job queued.');
 const requestKey='product-hero-v1-smoke-'+manifest.assetId+'-'+manifest.input.seed+(verifiedRmbg?'-verified-rmbg-v2':'');
 if(await db.executionJob.findUnique({where:{requestKey}}))throw new Error('This fixed verification was already queued. Inspect its saved job; no duplicate run is allowed.');
 if(await db.executionJob.count({where:{status:{in:['queued','running','cancel_requested']}}}))throw new Error('Another job is active. Do not mix verification work.');
 const baseline=await dryRunBenchmark(effectiveFixture,{env:process.env});
 const prior=await db.generation.findMany({where:{assetId:manifest.assetId},orderBy:{id:'asc'}}),priorHash=createHash('sha256').update(JSON.stringify(prior)).digest('hex');
 const job=await createJob({campaignId:c.id,assetId:manifest.assetId,productHero:manifest.input,requestKey});console.log('Queued one Product Hero job: '+job.id+'. The existing worker must be running.');
 const deadline=Date.now()+15*60*1000;let completed=await getJob(job.id);
 while(Date.now()<deadline&&['queued','running','cancel_requested'].includes(completed.status)){await delay(1000);completed=await getJob(job.id);}
 if(['queued','running','cancel_requested'].includes(completed.status))throw new Error('Verification still active. Inspect its job; do not queue another.');
 const campaign=(await getCampaign(c.id))!,g=campaign.assets.find(a=>a.id===manifest.assetId)!.generations.find(g=>g.jobId===job.id),hero=g?.context?.productHero,r=g?.context?.reproducibility;
 const after=await db.generation.findMany({where:{id:{in:prior.map(g=>g.id)}},orderBy:{id:'asc'}});
 const summary={job:completed,effectiveFixture,generationId:g?.id??null,version:g?.version??null,imageUrl:g?.imageUrl??null,productHero:hero??null,evaluation:g?.evaluation??null,reproducibility:r??null,usage:await usageReport({jobId:job.id}),priorGenerationCount:prior.length,priorVersionsUnchanged:priorHash===createHash('sha256').update(JSON.stringify(after)).digest('hex')};
 await writeFile(verifiedRmbg?'storage/product-hero-live-verification-rmbg-v2.json':'storage/product-hero-live-verification.json',JSON.stringify(summary,null,2),{flag:'wx'});
 if(g&&hero&&r){const evaluation=g.evaluation,blocking=evaluation?.blockingIssues??null;
  const result=benchmarkResultSchema.parse({...baseline,id:randomUUID(),createdAt:new Date().toISOString(),execution:'measured',fixtureHash:fixtureChecksum(effectiveFixture),templateHash:r.templateHash,reproducibility:r,dependencies:[r.dependencies],metrics:{generation:'success',durationMs:hero.durationsMs.total,vision:evaluation?{provider:'openai',model:evaluation.model??'unknown',rubric:'paired-product-fidelity-v1',score:evaluation.overall}:null,blockerCount:blocking?.length??null,blockerCategories:blocking?[...new Set(blocking.map(b=>b.category))]:null,humanReview:'not_reviewed',refinementCount:0,dependencyFailure:false,oomFailure:false,productFidelity:null},notes:['One explicitly authorized B01-derived smoke attempt; effective fixture captures the actual campaign context and Product Hero settings. Human identity and commercial acceptance remain unreviewed. No baseline comparison arm executed.']});await saveBenchmarkResult(result);
 }
 console.log(JSON.stringify({jobId:job.id,status:completed.status,generationId:g?.id,imageUrl:g?.imageUrl,score:g?.evaluation?.overall,fidelity:hero?.fidelity,review:hero?.review,failure:completed.failure},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Verification failed.');process.exitCode=1;}).finally(()=>db.$disconnect());
