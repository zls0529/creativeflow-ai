import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/database/client';
import { createCampaign, getCampaign } from '../lib/database/campaigns';
import { runCampaign } from '../lib/agents/orchestrator';
import { analyseBrand, directCampaign, engineerPrompt } from '../lib/agents/creative';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { MockImageProvider } from '../lib/providers/image/mock';
import { MockVisionProvider } from '../lib/providers/vision/mock';
import { ComfyUIProvider } from '../lib/providers/image/comfyui';
import { demoBrief } from '../lib/demo';
import { assetSpecs, type Evaluation } from '../types/campaign';
import type { Providers } from '../lib/providers';
const env={...process.env};const ids:string[]=[];
beforeEach(()=>{process.env.CRITIC_THRESHOLD='80';process.env.MAX_REFINEMENTS='1';});
afterEach(()=>{process.env={...env};});
after(async()=>{await db.campaign.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
async function fixture() {
  const c=await createCampaign({...demoBrief,name:'TEST-CLOSED-LOOP'});ids.push(c.id);
  const llm=new MockLLMProvider();const brand=await analyseBrand(llm,demoBrief,[]);const direction=await directCampaign(llm,demoBrief,brand);const prompt=await engineerPrompt(llm,brand,direction,assetSpecs[0]);
  await db.brandProfile.create({data:{campaignId:c.id,data:JSON.stringify(brand)}});await db.creativeDirection.create({data:{campaignId:c.id,data:JSON.stringify(direction)}});
  const asset=await db.campaignAsset.create({data:{campaignId:c.id,kind:'hero',name:'Hero',width:1024,height:768,prompt:JSON.stringify(prompt)}});
  return {c,asset,brand,direction,prompt};
}
const blocker={category:'anatomy' as const,severity:'high' as const,observation:'Rear ankle appears structurally implausible.',interpretation:'The foot connection looks distorted.',recommendation:'Use separated legs and sharp, plausible ankles.'};
async function evaluation(overall:number,blocked=false):Promise<Evaluation>{return {...await new MockVisionProvider().evaluate({iteration:0} as never),provider:'openai',overall,blockingIssues:blocked?[blocker]:[],findings:[{observation:'Palette matches.',interpretation:'Retain successful colour direction.',recommendation:'Keep the existing palette.'}]};}
function providers(results:Evaluation[]) {
  let images=0,visions=0,revisions=0;const contexts:unknown[]=[];
  const image=new MockImageProvider();
  const p:Providers={llm:{name:'mock',generate:async r=>{revisions++;contexts.push(r.context);return r.schema.parse(r.mock());}},image:{name:'mock',workflow:r=>({mode:r.qualityPreference?'quality':'basic',reason:r.qualityPreference?.reason || 'Explicit basic'}),generate:async r=>{images++;return image.generate(r);}},vision:{name:'openai',evaluate:async()=>results[Math.min(visions++,results.length-1)]}};
  return {p,contexts,counts:()=>({images,visions,revisions})};
}
test('threshold pass stops without a prompt revision or approval',async()=>{
  const {c,asset}=await fixture();const setup=providers([await evaluation(90)]);await runCampaign(c.id,()=>{},{assetId:asset.id},setup.p);
  const a=(await getCampaign(c.id))!.assets[0];assert.equal(a.status,'ready');assert.equal(a.generations.length,1);assert.match(a.generations[0].context!.stopReason!,/threshold met/);assert.deepEqual(setup.counts(),{images:1,visions:1,revisions:0});
});
test('reference conditioning and strengths persist per version without changing earlier history',async()=>{
  const {c,asset}=await fixture();const setup=providers([await evaluation(90)]);
  await runCampaign(c.id,()=>{},{assetId:asset.id},setup.p);
  const original=(await getCampaign(c.id))!.assets[0].generations[0];
  const generate=setup.p.image.generate;
  setup.p.image.generate=async request=>{
    assert.deepEqual(request.conditioningStrength,{product:1,style:0.3});
    return {...await generate(request),referenceConditioning:{mode:'ip-adapter',model:'fixture-model',encoder:'fixture-encoder',references:[{id:'fixture-product',role:'product',strength:1,weightType:'linear',sha256:'a'.repeat(64)}]}};
  };
  await runCampaign(c.id,()=>{},{assetId:asset.id},setup.p,{product:1,style:0.3});
  const generations=(await getCampaign(c.id))!.assets[0].generations;
  assert.equal(generations.length,2);assert.deepEqual(generations[0],original);
  assert.equal(generations[1].context?.referenceConditioning?.references[0].strength,1);
  assert.equal(generations[1].context?.referenceConditioning?.mode,'ip-adapter');
});
test('blocking issue overrides high score, supplies structured context and selects quality; a lower second score is retained',async()=>{
  const {c,asset,brand,direction,prompt}=await fixture();const setup=providers([await evaluation(95,true),await evaluation(35,true)]);
  await runCampaign(c.id,()=>{},{assetId:asset.id},setup.p);
  const a=(await getCampaign(c.id))!.assets[0];const [first,second]=a.generations;
  assert.equal(first.evaluation!.overall,95);assert.equal(second.evaluation!.overall,35);assert.equal(second.context!.workflowMode,'quality');assert.match(second.context!.workflowReason,/anatomy/);
  assert.equal(second.context!.previousGenerationId,first.id);assert.equal(second.context!.previousVersion,1);assert.ok(second.context!.targetedCorrections.length);assert.equal(a.status,'needs_review');assert.match(second.context!.stopReason!,/MAX_REFINEMENTS reached/);
  const context=setup.contexts[0] as Record<string,unknown>;assert.deepEqual(context.brand,brand);assert.deepEqual(context.direction,direction);assert.deepEqual(context.originalPrompt,prompt);assert.equal(context.workflowMode,'basic');assert.equal(context.version,1);assert.equal(context.placement,'hero');assert.equal(context.generationId,first.id);assert.deepEqual((context.evaluation as Evaluation).blockingIssues,[blocker]);
  assert.deepEqual(setup.counts(),{images:2,visions:2,revisions:1});
});
test('MAX_REFINEMENTS allows exactly two revisions and preserves every low-scoring version',async()=>{
  process.env.MAX_REFINEMENTS='2';const {c,asset}=await fixture();const setup=providers([await evaluation(20)]);await runCampaign(c.id,()=>{},{assetId:asset.id},setup.p);assert.deepEqual(setup.counts(),{images:3,visions:3,revisions:2});assert.equal((await getCampaign(c.id))!.assets[0].generations.length,3);
});
for(const phase of ['image','vision','invalid-refinement'] as const)test(`${phase} failure stops immediately and preserves attempted version`,async()=>{
  const {c,asset}=await fixture();const setup=providers([await evaluation(20)]);
  if(phase==='image')setup.p.image.generate=async()=>{throw new Error('Image provider unavailable');};
  if(phase==='vision')setup.p.vision.evaluate=async()=>{throw new Error('Vision provider unavailable');};
  if(phase==='invalid-refinement')setup.p.llm.generate=async()=>({} as never);
  await assert.rejects(runCampaign(c.id,()=>{},{assetId:asset.id},setup.p),/unavailable|Invalid refinement/);
  const a=(await getCampaign(c.id))!.assets[0];assert.equal(a.generations.length,1);assert.equal(a.status,'failed');
  const g=a.generations[0];assert.equal(g.status,phase==='image'?'image_failed':phase==='vision'?'evaluation_failed':'refinement_failed');
  assert.match(g.context!.stopReason!,/provider failure|invalid refinement/);
  if(phase==='image')assert.equal(g.imageUrl,'');else assert.ok(g.imageUrl);
  if(phase==='invalid-refinement')assert.equal(g.evaluation!.overall,20);else assert.equal(g.evaluation,null);
});
test('ComfyUI honors an anatomy quality preference even with basic configured',()=>{
  const provider=new ComfyUIProvider({COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture',COMFYUI_WORKFLOW_MODE:'basic'});
  assert.equal(provider.workflow({qualityPreference:{reason:'Anatomy blocker'}} as never).mode,'quality');
});
