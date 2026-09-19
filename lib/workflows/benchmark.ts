import 'server-only';
import {readFile,realpath,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {benchmarkFixtureSchema,benchmarkResultSchema,type BenchmarkFixture,type BenchmarkResult} from '@/types/benchmark';
import {getWorkflow,auditRegistry} from './registry';
import {checkDependencies,probeDependencies} from './dependencies';
import {checksum} from './hash';

export function parseFixtures(value:unknown){
 const fixtures=benchmarkFixtureSchema.array().min(1).parse(value),seen=new Set<string>();
 for(const f of fixtures){if(seen.has(f.id))throw new Error('Duplicate benchmark fixture ID.');seen.add(f.id);getWorkflow(f.expectedWorkflow.id,f.expectedWorkflow.version);if(f.targetWorkflow)getWorkflow(f.targetWorkflow.id,f.targetWorkflow.version);}
 return fixtures;
}
export async function loadFixtures(file='benchmarks/fixtures.json'){return parseFixtures(JSON.parse(await readFile(file,'utf8')));}
export async function validateReferences(f:BenchmarkFixture,root=process.cwd()){
 const issues:string[]=[],base=await realpath(root);
 for(const r of f.references){try{
  const file=await realpath(path.resolve(base,r.file)),relative=path.relative(base,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error();
  const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)issues.push('Reference checksum mismatch: '+r.id);
 }catch{issues.push('Reference missing or outside workspace: '+r.id);}}
 return issues;
}
export const samplePlan={development:{smokeSeedsPerCase:3,comparisonSeedsPerCase:10,referenceSetsBeforePromotion:3},release:{seedsPerReferenceSet:20,minimumReferenceSets:5,minimumAttemptsPerUseCaseAndProfile:100,heldOutFivePlacementSets:20,repairDistinctSources:20}} as const;
export function fixtureChecksum(f:BenchmarkFixture){const {expectedWorkflow,targetWorkflow,...content}=f;void expectedWorkflow;void targetWorkflow;return checksum(content);}
/** Deliberately has no generation/provider/agent dependency. Explicit probes only perform GET. */
export async function dryRunBenchmark(f:BenchmarkFixture,options:{mode?:'development'|'release';seed?:number;inspectDependencies?:boolean;env?:Record<string,string|undefined>;fetcher?:typeof fetch}={}):Promise<BenchmarkResult>{
 benchmarkFixtureSchema.parse(f);
 const seed=options.seed??f.seeds[0];if(!f.seeds.includes(seed))throw new Error('Seed must belong to the frozen fixture.');
 const w=getWorkflow(f.expectedWorkflow.id,f.expectedWorkflow.version),entries=[w];
 if(w.id==='product_hero_v1')entries.push(getWorkflow('product_hero_sam_v1','1.1.0'));
 if(w.id!=='commercial_poster_v1'&&f.references.some(r=>r.role==='style'||r.role==='product'&&w.id!=='product_hero_v1'))entries.push(getWorkflow('reference_sd15_v1','1.0.0'));
 const audit=await auditRegistry(entries),issues=await validateReferences(f);
 for(const a of audit.workflows)if(a.state!=='match')issues.push(a.id+': '+a.state);
 const available=['prompt',...f.references.map(r=>r.role),...(f.region?['mask']:[])];
 if(w.requiredInputs.some(i=>!available.includes(i)))issues.push('Required workflow inputs are missing.');
 if(f.references.some(r=>!w.supportedInputs.includes(r.role)))issues.push('Workflow does not support the supplied reference role.');
 const profile=w.outputProfiles[f.placement];
 if(w.kind==='workflow'&&!w.id.startsWith('repair')&&(!profile||profile.width!==f.outputSize.width||profile.height!==f.outputSize.height))issues.push('Fixture dimensions do not match the registered placement profile.');
 let probe:Awaited<ReturnType<typeof probeDependencies>>|undefined;
 if(options.inspectDependencies){try{probe=await probeDependencies(options.env,options.fetcher);}catch{issues.push('Dependency probe unavailable; no generation attempted.');}}
 const checks=entries.map(entry=>checkDependencies(entry,options.env??process.env,probe?.catalog));
 for(const c of checks)issues.push(...c.missing);
 const dependencyState=checks.some(c=>c.state==='unavailable')||options.inspectDependencies&&!probe?'unavailable':probe?'advertised':'not_checked';
 const dependencies=checks.map(c=>({...c.snapshot,source:probe?'explicit_read_only_probe' as const:c.snapshot.source,comfyuiVersion:probe?.comfyuiVersion??null}));
 return benchmarkResultSchema.parse({schemaVersion:1,id:randomUUID(),createdAt:new Date().toISOString(),protocol:'commercial-benchmark-v1',mode:options.mode??'development',execution:options.inspectDependencies?'dependency_check':'dry_run',fixtureId:f.id,fixtureHash:fixtureChecksum(f),category:f.category,workflow:f.expectedWorkflow,templateHash:audit.workflows[0].actualHash,seed,referenceHashes:f.references.map(r=>r.sha256),dependencies,reproducibility:null,
  validation:{valid:!issues.length,issues,dependencies:dependencyState},metrics:{generation:'not_run',durationMs:null,vision:null,blockerCount:null,blockerCategories:null,humanReview:'not_reviewed',refinementCount:null,dependencyFailure:null,oomFailure:null,productFidelity:null},
  notes:['Validation only. No images, campaign mutations, paid calls, or measured quality results.','Fixture seed and prompts are frozen; release mode changes the sample plan only. No batch is executed.']});
}
export async function saveBenchmarkResult(value:unknown,directory='storage/benchmarks'){
 const result=benchmarkResultSchema.parse(value);await mkdir(directory,{recursive:true});
 const file=path.join(directory,result.id+'.json');await writeFile(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});return file;
}
export async function loadBenchmarkResult(id:string,directory='storage/benchmarks'){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid benchmark result ID.');
 const result=benchmarkResultSchema.parse(JSON.parse(await readFile(path.join(directory,id+'.json'),'utf8')));if(result.id!==id)throw new Error('Result identity mismatch.');return result;
}
function measured(results:BenchmarkResult[]){const seen=new Set<string>();return results.map(r=>benchmarkResultSchema.parse(r)).filter(r=>{if(seen.has(r.id))throw new Error('Duplicate result ID.');seen.add(r.id);return r.execution==='measured';});}
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function summarizeResults(results:BenchmarkResult[]){
 const runs=measured(results),successful=runs.filter(r=>r.metrics.generation==='success'),reviewed=successful.filter(r=>r.metrics.blockerCount!==null);
 const scores=successful.flatMap(r=>r.metrics.vision?[r.metrics.vision.score]:[]),fidelity=successful.flatMap(r=>r.metrics.productFidelity?[r.metrics.productFidelity.score]:[]);
 return {attempts:runs.length,successes:successful.length,successRate:runs.length?successful.length/runs.length:null,reviewed:reviewed.length,unreviewed:successful.length-reviewed.length,blockerRate:reviewed.length?reviewed.filter(r=>r.metrics.blockerCount!>0).length/reviewed.length:null,
 meanVisionScore:mean(scores),visionCount:scores.length,meanDurationMs:mean(runs.flatMap(r=>r.metrics.durationMs===null?[]:[r.metrics.durationMs])),meanRefinementCount:mean(runs.flatMap(r=>r.metrics.refinementCount===null?[]:[r.metrics.refinementCount])),meanProductFidelity:mean(fidelity),productFidelityCount:fidelity.length,
 dependencyFailures:runs.filter(r=>r.metrics.dependencyFailure===true).length,dependencyObserved:runs.filter(r=>r.metrics.dependencyFailure!==null).length,oomFailures:runs.filter(r=>r.metrics.oomFailure===true).length,oomObserved:runs.filter(r=>r.metrics.oomFailure!==null).length};
}
export function compareResults(left:BenchmarkResult[],right:BenchmarkResult[]){
 const a=measured(left),b=measured(right),warnings:string[]=[];
 const arm=(rs:BenchmarkResult[])=>new Set(rs.map(r=>r.workflow.id+'@'+r.workflow.version+':'+r.templateHash));
 if(arm(a).size!==1||arm(b).size!==1)warnings.push('Each arm requires one pinned workflow/version/hash and measured attempts.');
 const pairs=(rs:BenchmarkResult[])=>rs.map(r=>[r.fixtureId,r.fixtureHash,r.seed,r.referenceHashes.slice().sort().join(',')].join(':')).sort();
 if(JSON.stringify(pairs(a))!==JSON.stringify(pairs(b)))warnings.push('Fixture/seed/reference pairs differ. Aggregate differences are not a paired experiment.');
 const reviews=(rs:BenchmarkResult[])=>[...new Set(rs.flatMap(r=>r.metrics.vision?[r.metrics.vision.provider+':'+r.metrics.vision.model+':'+r.metrics.vision.rubric]:[]))].sort();
 const fidelity=(rs:BenchmarkResult[])=>[...new Set(rs.flatMap(r=>r.metrics.productFidelity?[r.metrics.productFidelity.rubric]:[]))].sort();
 if(JSON.stringify(reviews(a))!==JSON.stringify(reviews(b))||reviews(a).length>1)warnings.push('Vision reviewer/rubric differs; scores are descriptive only.');
 if(JSON.stringify(fidelity(a))!==JSON.stringify(fidelity(b))||fidelity(a).length>1)warnings.push('Product fidelity rubrics differ.');
 const environments=(rs:BenchmarkResult[])=>[...new Set(rs.map(r=>checksum(r.dependencies)))].sort();
 if(JSON.stringify(environments(a))!==JSON.stringify(environments(b)))warnings.push('Dependency/environment snapshots differ; the same seed may not reproduce the same pixels.');
 if(Math.min(a.length,b.length)<10)warnings.push('Insufficient measured sample for candidate comparison.');
 if([...a,...b].some(r=>r.metrics.humanReview==='not_reviewed'))warnings.push('Human review is incomplete.');
 return {left:summarizeResults(left),right:summarizeResults(right),paired:!!a.length&&!!b.length&&JSON.stringify(pairs(a))===JSON.stringify(pairs(b)),warnings,winner:null,conclusion:'Descriptive comparison only; release eligibility and human review are separate. No automatic winner.'};
}
/** Evidence checklist, not a claim of commercial quality or an automatic registry mutation. */
export function releaseGate(results:BenchmarkResult[],target:'benchmarking'|'candidate'|'validated',reviewedReport?:{reviewer:string;reportSha256:string}){
 const runs=measured(results),summary=summarizeResults(results),reasons:string[]=[];
 if(target==='benchmarking'){if(!results.length||results.some(r=>!r.validation.valid))reasons.push('Passing fixture/template/configuration preflight is required.');return {target,eligible:!reasons.length,reasons};}
 const arms=new Set(runs.map(r=>[r.workflow.id,r.workflow.version,r.templateHash,r.category].join(':')));
 if(arms.size!==1)reasons.push('Evidence must cover exactly one pinned workflow and use case.');
 const sets=new Set(runs.map(r=>r.referenceHashes.slice().sort().join(',')));
 const uniquePairs=new Set(runs.map(r=>r.fixtureHash+':'+r.seed));
 if(uniquePairs.size<(target==='validated'?100:10))reasons.push('Insufficient distinct fixture/seed attempts.');
 if(sets.size<(target==='validated'?5:3))reasons.push('Insufficient independent reference sets.');
 if(runs.some(r=>!r.validation.valid||!r.reproducibility?.registeredHashMatches))reasons.push('Missing verified submitted-graph provenance.');
 if(new Set(runs.map(r=>r.reproducibility?.checkpoint??'unknown')).size!==1)reasons.push('Different checkpoint profiles cannot be pooled for promotion.');
 if(summary.successRate===null||summary.successRate<0.98)reasons.push('Technical success below proposed 98% gate.');
 if(runs.some(r=>r.metrics.generation==='success'&&(r.metrics.humanReview==='not_reviewed'||r.metrics.blockerCount===null)))reasons.push('Human/blocker review is incomplete.');
 if(runs.length===0||runs.filter(r=>r.metrics.humanReview==='approved').length/runs.length<0.8)reasons.push('Human acceptance below proposed 80% gate.');
 if(summary.blockerRate===null||summary.blockerRate>0.05)reasons.push('Blocker rate above proposed 5% gate or unrecorded.');
 if(target==='validated'){
  // Current result format does not yet implement cross-placement, pixel-preservation,
  // blinded adjudication or confidence-bound gates. Never bypass those using counts.
  reasons.push('Validated promotion requires the additional preservation, held-out campaign, confidence-bound and stratified review evidence in workflow-benchmark-plan.md; automatic validation is not implemented.');
  if(!reviewedReport?.reviewer||! /^[a-f0-9]{64}$/.test(reviewedReport.reportSha256))reasons.push('A signed, hashed human release report is required.');
 }
 return {target,eligible:!reasons.length,reasons};
}
