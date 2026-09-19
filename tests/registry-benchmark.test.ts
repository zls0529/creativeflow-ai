import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {registry,validateRegistry,workflowForMode,auditRegistry,routingCandidates} from '../lib/workflows/registry';
import {templateHash} from '../lib/workflows/hash';
import {dependencySnapshot,checkDependencies,probeDependencies} from '../lib/workflows/dependencies';
import {recordReproducibility,withReproducibility} from '../lib/workflows/reproducibility';
import {fillWorkflow} from '../lib/providers/image/comfyui';
import {generationContextSchema} from '../types/refinement';
import {benchmarkResultSchema,type BenchmarkResult} from '../types/benchmark';
import {loadFixtures,parseFixtures,validateReferences,dryRunBenchmark,saveBenchmarkResult,loadBenchmarkResult,compareResults,releaseGate,fixtureChecksum} from '../lib/workflows/benchmark';

const env={COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'test.safetensors'};
async function simpleFixture(){const f=structuredClone((await loadFixtures())[0]);f.references=[];f.expectedWorkflow={id:'legacy_basic_v1',version:'1.0.0'};return f;}
const noFetch:typeof fetch=async()=>{throw new Error('Network forbidden');};
async function recorded(){const template=JSON.parse(await readFile('comfyui/workflows/basic_text2img_api.json','utf8'));const graph=fillWorkflow(template,{checkpoint:'test.safetensors',positive:'Product photo',negative:'blur',width:1024,height:768,seed:42,steps:25,cfg:6,sampler:'euler',scheduler:'normal'});return recordReproducibility({mode:'basic',template,graph,width:1024,height:768});}
function measured(base:BenchmarkResult,overrides:Partial<BenchmarkResult['metrics']>={}):BenchmarkResult{
 return benchmarkResultSchema.parse({...base,id:randomUUID(),execution:'measured',metrics:{...base.metrics,generation:'success',durationMs:100,refinementCount:0,dependencyFailure:false,oomFailure:false,...overrides}});
}
test('registry validates all legacy, extension and future definitions; rejects duplicate identity',()=>{
 assert.equal(registry.length,18);assert.equal(registry.filter(w=>w.kind==='placeholder').length,6);
 assert.throws(()=>validateRegistry([registry[0],registry[0]]),/Duplicate/);
 assert.equal(validateRegistry([registry[0],{...registry[0],version:'1.0.1'}]).length,2);
 for(const version of ['latest','1','01.0.0','1.0'])assert.throws(()=>validateRegistry([{...registry[0],version}]));
 assert.throws(()=>validateRegistry([{...registry[0],workflowTemplate:'../private.json'}]));
 assert.throws(()=>validateRegistry([{...registry[0],releaseState:'validated'}]),/reviewed benchmark/);
 assert.equal(workflowForMode('sports_pose').id,'legacy_sports_pose_v1');
 assert.equal(routingCandidates({useCase:'product_hero',tier:'professional',inputs:['prompt','product']}).length,1);
});
test('template checksum ignores key order/whitespace, tracks changes, excludes credentials and private paths',()=>{
 assert.equal(templateHash({b:2,a:{z:1,x:[3,4]}}),templateHash(JSON.parse('{"a":{"x":[3,4],"z":1},"b":2}')));
 assert.notEqual(templateHash({steps:20}),templateHash({steps:21}));
 assert.notEqual(templateHash([1,2]),templateHash([2,1]));
 for(const value of [{path:'C:\\private\\model'},{path:'/private/model'},{apiKey:'hidden'},{node:'sk-not-a-real-secret'}])assert.throws(()=>templateHash(value));
});
test('audit identifies missing templates, mismatches and unregistered files without changing templates',async()=>{
 const actual=await auditRegistry();assert.ok(actual.workflows.every(w=>w.state==='match'||w.state==='placeholder'));assert.deepEqual(actual.unregisteredTemplates,[]);
 assert.equal((await auditRegistry([registry[0]],async()=>{throw new Error();})).workflows[0].state,'missing_or_invalid');
 const changed=await auditRegistry([registry[0]],async()=>'{"changed":true}');assert.equal(changed.workflows[0].state,'hash_mismatch');assert.ok(changed.unregisteredTemplates.length>0);
});
test('dependency snapshots redact paths, distinguish unknowns and report missing models/nodes',()=>{
 const s=dependencySnapshot(['KSampler','Missing'],[{role:'checkpoint',name:'C:\\private\\test.safetensors'}],{KSampler:{python_module:'custom_nodes.test',version:'1.2.3'}},'0.3.1',true);
 assert.equal(s.comfyuiVersion,'0.3.1');assert.equal(s.models[0].name,'test.safetensors');assert.equal(s.nodes.find(n=>n.classType==='Missing')!.available,false);assert.doesNotMatch(JSON.stringify(s),/private/);
 assert.equal(dependencySnapshot(['KSampler'],[]).nodes[0].available,null);
 const check=checkDependencies(registry[0],{},{});assert.equal(check.state,'unavailable');assert.match(check.missing.join(' '),/checkpoint/);
});
test('explicit dependency probe uses GET only and records advertised version, never submits a graph',async()=>{
 const urls:string[]=[];const probe=await probeDependencies(env,async(url,init)=>{assert.equal(init?.method,'GET');urls.push(String(url));return Response.json(String(url).endsWith('object_info')?{KSampler:{}}:{system:{comfyui_version:'0.3.1'}});});
 assert.equal(probe.comfyuiVersion,'0.3.1');assert.equal(urls.length,2);assert.ok(urls.every(u=>!u.includes('prompt')));
 await assert.rejects(probeDependencies(env,noFetch),/could not be inspected/);
});
test('reproducibility captures actual submitted values and preserves metadata before a failed request',async()=>{
 const r=await recorded();assert.equal(r.seed,42);assert.equal(r.sampling[0].steps,25);assert.equal(r.sampling[0].cfg,6);assert.equal(r.registeredHashMatches,true);assert.equal(r.dependencies.source,'not_queried');assert.equal(r.dependencies.comfyuiVersion,null);
 let captured:unknown;
 await assert.rejects(withReproducibility(v=>{captured=v;},async()=>{await recorded();throw new Error('failed submit');}),/failed submit/);assert.deepEqual(captured,r);
});
test('historical context remains valid with absent reproduction fields; new fields round-trip',async()=>{
 const old={workflowMode:'sports',workflowReason:'old label',previousGenerationId:null,previousVersion:null,refinementIndex:0,targetedCorrections:[]};
 assert.equal(generationContextSchema.parse(old).reproducibility,undefined);
 const r=await recorded();assert.deepEqual(generationContextSchema.parse({...old,reproducibility:r}).reproducibility,r);
});
test('fixture loading validates six frozen categories, IDs, seeds, versions and reference paths',async()=>{
 const fs=await loadFixtures();assert.equal(fs.length,6);assert.equal(new Set(fs.map(f=>f.category)).size,6);
 assert.throws(()=>parseFixtures([fs[0],fs[0]]),/Duplicate/);assert.throws(()=>parseFixtures([{...fs[0],seeds:[1,1]}]));
 assert.throws(()=>parseFixtures([{...fs[0],expectedWorkflow:{id:'missing',version:'1.0.0'}}]));
 assert.throws(()=>parseFixtures([{...fs[0],references:[{...fs[0].references[0],file:'../secret.jpg'}]}]));
 assert.equal(fixtureChecksum(fs[0]),fixtureChecksum({...fs[0],expectedWorkflow:fs[1].targetWorkflow!}));
 assert.notEqual(fixtureChecksum(fs[0]),fixtureChecksum({...fs[0],fixedPrompt:{...fs[0].fixedPrompt,positive:'changed'}}));
});
test('reference validation detects tampering and missing input without uploading',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'creativeflow-bench-ref-'));
 try{const bytes=Buffer.from('reference'),f=await simpleFixture();await writeFile(path.join(dir,'ref.png'),bytes);f.references=[{id:'P1',role:'product',file:'ref.png',sha256:createHash('sha256').update(bytes).digest('hex')}];
 assert.deepEqual(await validateReferences(f,dir),[]);await writeFile(path.join(dir,'ref.png'),'changed');assert.match((await validateReferences(f,dir)).join(),/mismatch/);f.references[0].file='missing.png';assert.match((await validateReferences(f,dir)).join(),/missing/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('offline dry run records null outcomes and no network; release plan does not execute samples',async()=>{
 const f=await simpleFixture(),r=await dryRunBenchmark(f,{env,fetcher:noFetch,mode:'release'});
 assert.equal(r.validation.valid,true);assert.equal(r.validation.dependencies,'not_checked');assert.equal(r.metrics.generation,'not_run');assert.equal(r.metrics.durationMs,null);assert.equal(r.metrics.vision,null);assert.equal(r.mode,'release');
 await assert.rejects(dryRunBenchmark(f,{seed:999,env}),/frozen/);
 assert.throws(()=>benchmarkResultSchema.parse({...r,metrics:{...r.metrics,vision:{provider:'openai',model:'gpt-4.1',rubric:'v1',score:99}}}),/Dry runs/);
 const unavailable=await dryRunBenchmark(f,{env,fetcher:noFetch,inspectDependencies:true});assert.equal(unavailable.validation.valid,false);assert.equal(unavailable.metrics.dependencyFailure,null);
 const placeholder=await dryRunBenchmark({...f,expectedWorkflow:f.targetWorkflow!},{env});assert.equal(placeholder.validation.valid,false);
});
test('result persistence validates shape, refuses overwrite and path traversal, and round-trips nulls',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'creativeflow-bench-result-'));
 try{const r=await dryRunBenchmark(await simpleFixture(),{env,fetcher:noFetch});await saveBenchmarkResult(r,dir);assert.deepEqual(await loadBenchmarkResult(r.id,dir),r);await assert.rejects(saveBenchmarkResult(r,dir),/EEXIST/);await assert.rejects(loadBenchmarkResult('../secret',dir));await assert.rejects(saveBenchmarkResult({...r,execution:'measured'},dir));}finally{await rm(dir,{recursive:true,force:true});}
});
test('comparison uses observed denominators, preserves missing values and never crowns a dry-run winner',async()=>{
 const r=await dryRunBenchmark(await simpleFixture(),{env,fetcher:noFetch});
 const dry=compareResults([r],[r]);assert.equal(dry.left.successRate,null);assert.equal(dry.left.meanVisionScore,null);assert.equal(dry.winner,null);assert.equal(dry.paired,false);
 const a=measured(r,{blockerCount:1,blockerCategories:['product'],vision:{provider:'openai',model:'gpt-4.1',rubric:'v1',score:70}}),b=measured({...r,seed:r.seed+1},{generation:'failure',durationMs:200,oomFailure:true});
 const comparison=compareResults([a,b],[{...a,id:randomUUID(),workflow:{id:'legacy_quality_v1',version:'1.0.0'}}]);
 assert.equal(comparison.left.successRate,0.5);assert.equal(comparison.left.blockerRate,1);assert.equal(comparison.left.meanVisionScore,70);assert.equal(comparison.left.meanDurationMs,150);assert.equal(comparison.left.oomFailures,1);assert.equal(comparison.paired,false);assert.equal(comparison.winner,null);
 assert.throws(()=>compareResults([a,a],[b]),/Duplicate/);
 const paired=compareResults([a],[{...a,id:randomUUID(),workflow:{id:'legacy_quality_v1',version:'1.0.0'}}]);assert.equal(paired.paired,true);
});
test('release gates accept preflight only for benchmarking; one good image never validates a workflow',async()=>{
 const r=await dryRunBenchmark(await simpleFixture(),{env,fetcher:noFetch});assert.equal(releaseGate([r],'benchmarking').eligible,true);
 const good=measured({...r,seed:42},{blockerCount:0,blockerCategories:[],humanReview:'approved'});good.reproducibility=await recorded();
 assert.equal(releaseGate([good],'candidate').eligible,false);const gate=releaseGate([good],'validated');assert.equal(gate.eligible,false);assert.match(gate.reasons.join(),/additional preservation/);
 assert.equal(releaseGate([],'benchmarking').eligible,false);
});

test('Klein benchmark native references do not add SD1.5 adapter dependencies',async()=>{
 const f=structuredClone((await loadFixtures())[0]);f.category='commercial_poster';f.expectedWorkflow={id:'commercial_poster_v1',version:'1.0.0'};delete f.targetWorkflow;f.placement='hero';f.outputSize={width:880,height:592};
 const result=await dryRunBenchmark(f,{env,fetcher:noFetch});assert.equal(result.dependencies.length,1);assert.ok(result.dependencies[0].nodes.some(n=>n.classType==='ReferenceLatent'));assert.ok(!result.dependencies[0].nodes.some(n=>n.classType.includes('IPAdapter')));
});
