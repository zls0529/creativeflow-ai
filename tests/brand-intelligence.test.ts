import {test,after,beforeEach,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {materialAnalysisSchema,visualEligibility} from '../types/brand-intelligence';
import {extractPdf,analyseMaterial} from '../lib/brand/materials';
import {approveRules,analyseBrandFiles} from '../lib/brand/service';
import {saveIntelligence,readIntelligence} from '../lib/brand/store';
import {guardBrand,detectConflicts,resolveConflict} from '../lib/brand/conflicts';
import {validateCompliance} from '../lib/brand/compliance';
import {brandConstraintsSchema,emptyIntelligence,brandBlockers,type BrandConstraints} from '../types/brand-intelligence';
import {analyseBrand,directCampaign,engineerPrompt,refinePrompt} from '../lib/agents/creative';
import {refinementDecision} from '../lib/agents/refinement-decision';
import {MockLLMProvider} from '../lib/providers/llm/mock';
import {MockVisionProvider} from '../lib/providers/vision/mock';
import type {LLMProvider,StructuredRequest} from '../lib/providers/llm/base';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {db} from '../lib/database/client';
import {storage} from '../lib/storage';
import {demoBrief} from '../lib/demo';
import {assetSpecs,type Evaluation} from '../types/campaign';
import {runCampaign} from '../lib/agents/orchestrator';
import {MockImageProvider} from '../lib/providers/image/mock';
import {makeBrandPdf} from './fixtures/brand-pdf';
const source={id:'source-one',name:'brand.pdf',role:'guidelines',mime:'application/pdf',sha256:'abc',provider:'openai',analysedAt:'2026-09-18',summary:'NORTHLINE LAB rules'};
const rule={id:'rule-one',sourceId:source.id,category:'avoid_colours' as const,text:'Avoid neon green.',originalText:'Avoid neon green.',origin:'source' as const,binding:true,evidence:'Avoid neon green.',page:1,uncertainty:'',visuallyEvaluable:true,edited:false};
const constraints:BrandConstraints={revision:'rev-one',approvedAt:'2026-09-18',summary:'Minimal brand',rules:[rule],sources:[source],overriddenRuleIds:[]};
const ids:string[]=[],files:string[]=[];
beforeEach(()=>mock.method(globalThis,'fetch',async()=>{throw new Error('Network disabled in automated brand tests');}));
afterEach(()=>mock.restoreAll());
after(async()=>{for(const id of files)await storage.remove(id);await db.campaign.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
const fake=(value:unknown):LLMProvider=>({name:'fixture',generate:async r=>r.schema.parse(value)});
test('material schema uses compatible integer bounds for OpenAI structured output',()=>{const schema=JSON.stringify(zodToJsonSchema(materialAnalysisSchema,{target:'openAi',$refStrategy:'none'}));assert.doesNotMatch(schema,/"exclusiveMinimum":true/);assert.match(schema,/"minimum":1/);});
test('visual eligibility concerns future generated pixels, not whether source was a PDF',()=>{assert.equal(visualEligibility('avoid_colours',false),true);assert.equal(visualEligibility('lighting',false),true);assert.equal(visualEligibility('messaging',true),false);assert.equal(visualEligibility('typography',false),false);});
async function upload(bytes:Buffer,role='guidelines',mime='application/pdf') {const id=randomUUID();files.push(id);await storage.put(id,bytes);return {id,name:'fixture',role,mime};}

test('PDF extracts real page text; source rules retain exact quote and page provenance',async()=>{
 const bytes=makeBrandPdf(['NORTHLINE LAB','Avoid neon green.','Use soft controlled studio lighting.']);
 const pages=await extractPdf(bytes);assert.equal(pages[0].page,1);assert.match(pages[0].text,/Avoid neon green/);
 const u=await upload(bytes);const result=await analyseMaterial(u,fake({summary:'Brand rules',rules:[{...rule}]}));
 assert.equal(result.rules[0].sourceId,u.id);assert.equal(result.rules[0].binding,true);assert.equal(result.rules[0].page,1);assert.equal(result.source.sha256.length,64);
});
test('PDF unsupported citations and incomplete analysis cannot be stored as evidence',async()=>{
 const u=await upload(makeBrandPdf(['Avoid neon green.']));
 await assert.rejects(analyseMaterial(u,fake({summary:'Rules',rules:[{...rule,evidence:'Invented quote'}]})),/unsupported PDF provenance/);
 await assert.rejects(analyseMaterial(u,fake({summary:'Rules'})));
});
test('empty or corrupted PDF and corrupted image fail with safe retryable errors',async()=>{
 await assert.rejects(extractPdf(Buffer.from('%PDF-broken')),/Unreadable PDF/);
 await assert.rejects(extractPdf(makeBrandPdf([])),/no readable text/);
 const u=await upload(Buffer.from([137,80,78,71,13,10,26,10]),'logo','image/png');await assert.rejects(analyseMaterial(u,new MockLLMProvider()),/Corrupted brand image/);
});
test('logo/reference pixels are attached; source observations and inferred advice stay separate',async()=>{
 const bytes=await sharp({create:{width:30,height:10,channels:4,background:'#172D3B'}}).png().toBuffer();
 for(const role of ['logo','style','product']){const u=await upload(bytes,role,'image/png');const llm:LLMProvider={name:'fixture',generate:async r=>{assert.match(r.images![0],/^data:image\/png;base64,/);return r.schema.parse({summary:'Dark navy horizontal image',rules:[{...rule,page:null,category:'visual_style',text:'Dark horizontal shape',evidence:'Visible dark navy rectangular form'},{...rule,page:null,origin:'inferred',text:'Consider calm lighting',evidence:'A possible style direction'}]});}};const out=await analyseMaterial(u,llm);assert.equal(out.rules[0].binding,false);assert.equal(out.rules[0].origin,'source');assert.equal(out.rules[1].origin,'inferred');assert.equal(out.rules[1].binding,false);}
});
test('edits preserve provenance/original text, removed rules stay removed, inference cannot become binding',()=>{
 const draft={summary:'Brand',rules:[rule,{...rule,id:'suggestion',origin:'inferred' as const,binding:false}],sources:[source]};
 const approved=approveRules({...emptyIntelligence(),draft},[{id:rule.id,text:'Avoid all neon colours.',visuallyEvaluable:true,binding:true}]);
 assert.equal(approved.approved!.rules.length,1);assert.equal(approved.approved!.rules[0].originalText,rule.text);assert.equal(approved.approved!.rules[0].edited,true);assert.equal(approved.approved!.rules[0].sourceId,source.id);assert.ok(brandConstraintsSchema.safeParse(approved.approved).success);
 assert.throws(()=>approveRules({...emptyIntelligence(),draft},[{id:'unknown',text:'foo',visuallyEvaluable:true,binding:true}]),/Unknown rule/);
});
test('brand, direction, placement prompt and refinement receive compact approved constraints',async()=>{
 const calls:StructuredRequest<unknown>[]=[];const llm:LLMProvider={name:'fixture',generate:async r=>{calls.push(r as StructuredRequest<unknown>);return r.schema.parse(r.mock());}};
 const brand=await analyseBrand(llm,demoBrief,[],constraints),direction=await directCampaign(llm,demoBrief,brand,constraints),prompt=await engineerPrompt(llm,brand,direction,assetSpecs[0],constraints);
 const evaluation:Evaluation=await new MockVisionProvider().evaluate({iteration:0} as never);evaluation.brandCompliance=validateCompliance(constraints,[{ruleId:rule.id,status:'possible_violation',confidence:'high',severity:'medium',observation:'Neon green dominates.',recommendation:'Exclude neon lighting.'}]);
 await refinePrompt(llm,prompt,evaluation,{brandConstraints:constraints,placement:'hero',brand,direction,originalPrompt:prompt,workflowMode:'basic',generationId:'g',version:1});
 for(const call of calls){const c=call.context as {constraints:{rules:unknown[]}};assert.equal(c.constraints.rules.length,1);assert.doesNotMatch(JSON.stringify(c.constraints),/sha256|brand.pdf/);}
 assert.match(JSON.stringify(calls.at(-1)?.context),/Neon green dominates/);
});
test('semantic conflict results require a real rule and exact requested evidence',async()=>{
 const llm=fake({conflicts:[{requested:'bright neon green',ruleId:rule.id,explanation:'Contradicts the explicit palette restriction.'}]});
 assert.equal((await detectConflicts(llm,constraints,'brief',{brief:'Use bright neon green city lighting.'})).length,1);
 await assert.rejects(detectConflicts(llm,constraints,'brief',{brief:'Use white studio lighting.'}),/unsupported evidence/);
 const c=resolveConflict(constraints,{id:'conflict',stage:'brief',ruleId:rule.id,requested:'green',explanation:'Conflict',status:'unresolved'},'user_override');assert.deepEqual(c.overriddenRuleIds,[rule.id]);assert.notEqual(c.revision,constraints.revision);
});
test('compliance validates coverage, nonvisual rules and nonbinding suggestions never block',()=>{
 const findings=[{ruleId:rule.id,status:'possible_violation' as const,confidence:'high' as const,severity:'high' as const,observation:'Green light.',recommendation:'Neutral lighting.'}];
 assert.equal(brandBlockers({brandCompliance:validateCompliance(constraints,findings)}).length,1);
 assert.equal(brandBlockers({brandCompliance:validateCompliance({...constraints,rules:[{...rule,category:'messaging'}]},findings)}).length,0);
 assert.equal(brandBlockers({brandCompliance:validateCompliance({...constraints,rules:[{...rule,origin:'inferred',binding:false}]},findings)}).length,0);
 assert.throws(()=>validateCompliance(constraints,[]),/omitted/);assert.throws(()=>validateCompliance(constraints,[...findings,...findings]),/duplicated/);
});
test('high-confidence compliance blocker triggers refinement despite high quality score; low confidence does not',async()=>{
 const evaluation={...await new MockVisionProvider().evaluate({iteration:0} as never),overall:95,blockingIssues:[],brandCompliance:validateCompliance(constraints,[{ruleId:rule.id,status:'possible_violation',confidence:'high',severity:'medium',observation:'Neon green dominates.',recommendation:'Exclude neon lighting.'}])};
 assert.equal(refinementDecision(evaluation,80,0,1).refine,true);assert.match(refinementDecision(evaluation,80,1,1).reason,/brand compliance/);
 evaluation.brandCompliance.findings[0].confidence='low';assert.equal(refinementDecision(evaluation,80,0,1).refine,false);
});
test('failed reanalysis preserves approved campaign rules and retry remains possible',async()=>{
 const c=await createCampaign({...demoBrief,name:'TEST-BRAND-FAILURE'});ids.push(c.id);await saveIntelligence(c.id,{draft:null,approved:constraints,conflicts:[]});
 const u=await upload(Buffer.from('%PDF-corrupt'));await db.upload.create({data:{...u,campaignId:c.id,size:12}});
 await assert.rejects(analyseBrandFiles(c.id,new MockLLMProvider()),/Unreadable PDF/);assert.deepEqual((await readIntelligence(c.id)).intelligence.approved,constraints);assert.equal((await getCampaign(c.id))!.brandProfile,null);
});
test('source selection rejects foreign uploads and can exclude an unreadable source',async()=>{
 const c=await createCampaign({...demoBrief,name:'TEST-BRAND-SOURCE-SELECTION'});ids.push(c.id);
 const broken=await upload(Buffer.from('%PDF-broken')),good=await upload(makeBrandPdf(['Avoid neon green.']));
 for(const u of [broken,good])await db.upload.create({data:{...u,campaignId:c.id,size:20}});
 await assert.rejects(analyseBrandFiles(c.id,new MockLLMProvider(),['foreign-source']),/belong/);
 const result=await analyseBrandFiles(c.id,fake({summary:'Palette rule',rules:[rule]}),[good.id]);assert.equal(result.draft?.sources.length,1);assert.equal(result.draft?.sources[0].id,good.id);
});
test('approving eligibility edits preserves resolution of an unchanged source rule',()=>{
 const intelligence={draft:{summary:'Brand',rules:[rule],sources:[source]},approved:constraints,conflicts:[{id:'c',stage:'brief' as const,requested:'neon green',ruleId:rule.id,explanation:'Contradicts palette',status:'guideline_enforced' as const}]};
 const result=approveRules(intelligence,[{id:rule.id,text:rule.text,binding:true,visuallyEvaluable:false}]);assert.equal(result.conflicts[0].status,'guideline_enforced');assert.equal(result.approved?.rules[0].visuallyEvaluable,false);
});
test('conflict gate persists unresolved conflict before any generation; enforcing brief rule does not excuse output violations',async()=>{
 const c=await createCampaign({...demoBrief,name:'TEST-BRAND-CONFLICT',brief:'Use bright neon green city lighting.'});ids.push(c.id);await saveIntelligence(c.id,{draft:null,approved:constraints,conflicts:[]});
 const llm=fake({conflicts:[{requested:'bright neon green',ruleId:rule.id,explanation:'Contradicts palette.'}]});
 await assert.rejects(guardBrand(c.id,llm,constraints,'brief',{brief:c.brief}),/requires attention/);
 const {intelligence}=await readIntelligence(c.id);assert.equal(intelligence.conflicts[0].status,'unresolved');intelligence.conflicts[0].status='guideline_enforced';await saveIntelligence(c.id,intelligence);
 await guardBrand(c.id,llm,constraints,'brief',{brief:c.brief});await assert.rejects(guardBrand(c.id,llm,constraints,'direction',{lighting:'bright neon green'}),/requires attention/);
 assert.equal((await getCampaign(c.id))!.assets.length,0);
});
test('approved rule snapshot and existing history survive constrained workflow; no-rule campaigns stay compatible',async()=>{
 const c=await createCampaign({...demoBrief,name:'TEST-BRAND-SNAPSHOT'});ids.push(c.id);await saveIntelligence(c.id,{draft:null,approved:constraints,conflicts:[]});
 const llm:LLMProvider={name:'fixture',generate:async r=>r.schema.parse(r.name==='brand_conflicts'?{conflicts:[]}:r.mock())};
 const brand=await analyseBrand(llm,demoBrief,[]),direction=await directCampaign(llm,demoBrief,brand),prompt=await engineerPrompt(llm,brand,direction,assetSpecs[0]);
 await db.creativeDirection.create({data:{campaignId:c.id,data:JSON.stringify(direction)}});const asset=await db.campaignAsset.create({data:{campaignId:c.id,kind:'hero',name:'Hero',width:100,height:100,prompt:JSON.stringify(prompt)}});
 const env={...process.env};process.env.MAX_REFINEMENTS='0';
 try{await runCampaign(c.id,()=>{},{assetId:asset.id},{llm,image:new MockImageProvider(),vision:{name:'fixture',evaluate:async r=>{assert.equal(r.brandConstraints?.revision,constraints.revision);return new MockVisionProvider().evaluate(r);}}});}finally{process.env={...env};}
 assert.equal((await getCampaign(c.id))!.assets[0].generations[0].context?.brandConstraints?.revision,constraints.revision);
 const plain=await createCampaign({...demoBrief,name:'TEST-BRAND-LEGACY'});ids.push(plain.id);assert.equal((await getCampaign(plain.id))!.brandIntelligence?.approved,null);
});
