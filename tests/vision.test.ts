import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import sharp from 'sharp';
import { OpenAIVisionProvider } from '../lib/providers/vision/openai';
import { OpenAIProviderError } from '../lib/providers/openai/responses';
import { scoreVision } from '../lib/providers/vision/scoring';
import { visionOutputSchema, scoreKeys, type VisionOutput } from '../types/vision';
import { evaluationSchema } from '../types/campaign';
import { getProviders } from '../lib/providers';
import { storage } from '../lib/storage';
import { saveEvaluation } from '../lib/database/evaluations';
import { createCampaign, getCampaign } from '../lib/database/campaigns';
import { db } from '../lib/database/client';
import { demoBrief } from '../lib/demo';
import type { VisionRequest } from '../lib/providers/vision/base';
import type {BrandConstraints} from '../types/brand-intelligence';
const file = `${randomUUID()}.png`;
const env = { ...process.env };
const clean = { status:'clear',severity:'none',observation:'Edges are coherent.',interpretation:'No obvious visual defect.',recommendation:'Preserve the composition.' } as const;
const output: VisionOutput = {
  brand_consistency:90,composition:90,visual_hierarchy:90,product_visibility:90,colour_consistency:90,campaign_relevance:90,visual_quality:90,prompt_adherence:90,
  integrity:{ visible_people:1,limb_plausibility:clean,duplicated_limbs:clean,leg_arm_anatomy:clean,feet_ankles:clean,hands:clean,body_proportions:clean,pose_plausibility:clean,product_structure:clean,duplicated_product_parts:clean,product_prominence:clean },
  blockingIssues:[],findings:[{observation:'A single product is clear.',interpretation:'Visual hierarchy is effective.',recommendation:'Keep the product prominent.'}]
};
const request = { imageUrl:`/api/generated/${file}`,objective:'Launch a running shoe',placement:'hero',version:3,iteration:2,
  prompt:{ subject:'One runner',environment:'Street',composition:'Full body',camera:'50mm',lighting:'Night',colour_palette:'Blue',style:'Photo',brand_constraints:'No text',negative_prompt:'blur' },
  brand:{campaign_goal:'Launch a running shoe'},direction:{visual_direction:'Night running'} } as VisionRequest;
before(async()=>{await storage.putGenerated(file,await sharp({create:{width:2000,height:1000,channels:3,background:'#336699'}}).png().toBuffer());});
after(async()=>{await storage.removeGenerated(file);await db.$disconnect();});
beforeEach(()=>{Object.assign(process.env,{OPENAI_API_KEY:'test-only-secret',VISION_MODEL:'gpt-4.1',OPENAI_TIMEOUT_MS:'60000',LLM_PROVIDER:'mock',IMAGE_PROVIDER:'mock',VISION_PROVIDER:'openai'});mock.method(globalThis,'fetch',async()=>{throw new Error('Live network disabled in tests');});});
afterEach(()=>{mock.restoreAll();process.env={...env};});
const envelope = (value:unknown) => ({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
test('real Vision adapter sends approved rules, validates per-rule coverage and retains compliance',async()=>{
 const constraints:BrandConstraints={revision:'brand-r1',approvedAt:'2026-09-18',summary:'Brand',sources:[],overriddenRuleIds:[],rules:[{id:'no-neon',sourceId:'pdf',category:'avoid_colours',text:'No neon green.',originalText:'No neon green.',origin:'source',binding:true,evidence:'No neon green.',page:1,uncertainty:'',visuallyEvaluable:true,edited:false}]};
 const finding={ruleId:'no-neon',status:'possible_violation',confidence:'high',severity:'medium',observation:'Neon green appears in background.',recommendation:'Exclude neon lighting.'};
 mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));assert.equal(JSON.parse(body.input[0].content[0].text).constraints.rules[0].id,'no-neon');return Response.json(envelope({...output,brandFindings:{'no-neon':finding}}));});
 const result=await new OpenAIVisionProvider().evaluate({...request,brandConstraints:constraints});assert.equal(result.brandCompliance?.revision,'brand-r1');assert.equal(result.brandCompliance?.findings[0].severity,'medium');assert.equal(result.overall,90);
 mock.method(globalThis,'fetch',async()=>Response.json(envelope({...output,brandFindings:{}})));
 await assert.rejects(new OpenAIVisionProvider().evaluate({...request,brandConstraints:constraints}),/schema/);
});
test('vision selection and credentials are independent of mock LLM/image providers',()=>{
  assert.equal(getProviders().vision.name,'openai');
  delete process.env.OPENAI_API_KEY;assert.throws(()=>getProviders(),/OPENAI_API_KEY is missing/);
  process.env.VISION_PROVIDER='mock';assert.equal(getProviders().vision.name,'mock');
  process.env.VISION_PROVIDER='unknown';assert.throws(()=>getProviders(),/Vision provider/);
});
test('actual PNG pixels are resized and attached; no path or iteration bias is sent',async()=>{
  mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));assert.equal(body.model,'gpt-4.1');assert.equal(body.store,false);
    assert.equal(body.text.format.strict,true);assert.doesNotMatch(JSON.stringify(body.text.format.schema), /"\$ref"/);assert.equal(body.input[0].content[1].type,'input_image');
    const data=body.input[0].content[1].image_url;assert.match(data,/^data:image\/jpeg;base64,/);
    const meta=await sharp(Buffer.from(data.split(',')[1],'base64')).metadata();assert.equal(meta.width,1536);assert.equal(meta.height,768);
    const context=JSON.parse(body.input[0].content[0].text);assert.equal(context.objective,request.objective);assert.equal(context.placement,'hero');assert.equal(context.version,3);
    assert.equal(context.iteration,undefined);assert.equal(context.imageUrl,undefined);assert.equal(context.previousEvaluation,undefined);
    assert.doesNotMatch(String(init.body),new RegExp(file));assert.doesNotMatch(String(init.body),/test-only-secret/);
    return Response.json(envelope(output));
  });
  const result=await new OpenAIVisionProvider().evaluate(request);assert.equal(result.overall,90);assert.equal(result.provider,'openai');assert.equal(result.model,'gpt-4.1');
});
test('invalid and missing images fail before network; mock SVG is not accepted',async()=>{
  const provider=new OpenAIVisionProvider();
  await assert.rejects(provider.evaluate({...request,imageUrl:''}),/missing/);
  for(const imageUrl of ['http://example.com/a.png','/api/generated/../.env','data:image/svg+xml;base64,eA==']) await assert.rejects(provider.evaluate({...request,imageUrl}),/Invalid vision image/);
  await assert.rejects(provider.evaluate({...request,imageUrl:`/api/generated/${randomUUID()}.png`}),/missing/);
  const invalid=`${randomUUID()}.png`;await storage.putGenerated(invalid,Buffer.from('not a PNG'));
  try{await assert.rejects(provider.evaluate({...request,imageUrl:`/api/generated/${invalid}`}),/Invalid vision image/);}finally{await storage.removeGenerated(invalid);}
});
test('component schema enforces 0–100 and required integrity data',()=>{
  for(const key of scoreKeys){assert.equal(visionOutputSchema.safeParse({...output,[key]:101}).success,false);assert.equal(visionOutputSchema.safeParse({...output,[key]:-1}).success,false);}
  assert.equal(visionOutputSchema.safeParse({...output,integrity:{}}).success,false);
  assert.equal(visionOutputSchema.safeParse({...output,blockingIssues:[{severity:'high'}]}).success,false);
});
test('high/medium defects cap consistent mean; severe integrity checks cannot bypass cap',()=>{
  const defect={category:'anatomy' as const,severity:'high' as const,observation:'Possible duplicated lower limb.',interpretation:'The silhouette appears inconsistent.',recommendation:'Regenerate one runner with two clearly separated legs.'};
  assert.equal(scoreVision({...output,blockingIssues:[defect]},'gpt-4.1').overall,49);
  assert.equal(scoreVision({...output,blockingIssues:[{...defect,severity:'medium'}]},'gpt-4.1').overall,69);
  const result=scoreVision({...output,integrity:{...output.integrity,duplicated_limbs:{...defect,status:'concern'}}},'gpt-4.1');
  assert.equal(result.overall,49);assert.ok(result.blockingIssues?.length);assert.match(result.feedback[0],/Recommended correction:/);
  assert.equal(scoreVision({...output,composition:10},'gpt-4.1').overall,80);
  assert.ok(evaluationSchema.safeParse(result).success);
  const duplicate=scoreVision({...output,blockingIssues:[defect,defect]},'gpt-4.1');
  assert.equal(duplicate.scoring?.penalty,20);
  assert.equal(scoreVision({...output,composition:0,blockingIssues:[{...defect,severity:'medium'}]},'gpt-4.1').overall,69);
});
for(const [status,code] of [[401,'authentication'],[429,'rate_limit'],[408,'timeout'],[404,'unsupported_model'],[400,'unsupported_model']] as const) test(`vision HTTP ${status} is sanitized without fallback`,async()=>{
  mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'test-only-secret C:\\private\\file.png'}},{status}));
  await assert.rejects(new OpenAIVisionProvider().evaluate(request),(e:unknown)=>e instanceof OpenAIProviderError && e.code===code && !/test-only-secret|private/.test(e.message));
});
test('malformed, refused and incomplete vision responses are rejected',async()=>{
  for(const [value,code] of [[envelope({}),'malformed_output'],[{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},'refused'],[{status:'incomplete',output:[]},'incomplete']] as const){
    mock.method(globalThis,'fetch',async()=>Response.json(value));
    await assert.rejects(new OpenAIVisionProvider().evaluate(request),(e:unknown)=>e instanceof OpenAIProviderError && e.code===code);
  }
});
test('saved reviews remain attached to the correct generation and retain earlier evaluation',async()=>{
  const c=await createCampaign({...demoBrief,name:'TEST-VISION-HISTORY'});
  try{
    const a=await db.campaignAsset.create({data:{campaignId:c.id,kind:'hero',name:'Hero',width:1024,height:768,prompt:JSON.stringify(request.prompt)}});
    const g=await db.generation.create({data:{assetId:a.id,version:1,prompt:JSON.stringify(request.prompt),imageUrl:request.imageUrl,provider:'comfyui',reason:'Test'}});
    const evaluation=scoreVision(output,'gpt-4.1');
    await saveEvaluation(g.id,'mock',{...evaluation,provider:'mock',overall:77});
    await saveEvaluation(g.id,'openai',evaluation);
    const stored=(await getCampaign(c.id))!.assets[0].generations[0];
    assert.equal(stored.id,g.id);assert.equal(stored.evaluation?.overall,90);assert.equal(stored.evaluation?.previousEvaluations?.[0].overall,77);
    assert.equal(stored.evaluation?.previousEvaluations?.[0].provider,'mock');
  }finally{await db.campaign.delete({where:{id:c.id}});}
});

test('poster reference review sends two bounded images, validates source hash and returns fidelity',async()=>{
 const id=randomUUID(),bytes=await storage.getGenerated(file);await storage.put(id,bytes);
 try{let calls=0;mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.input[0].content.filter((c:{type:string})=>c.type==='input_image').length,2);return Response.json(envelope({...output,productFidelity:{level:'high',silhouette:'Matches',structure:'Matches',colour:'Matches',logoText:'Not visible',lighting:'Coherent',seams:'Clean',findings:[]}}));});
 const provider=new OpenAIVisionProvider();await assert.rejects(provider.evaluate({...request,posterReference:{id,sha256:'0'.repeat(64)}}),/changed since generation/);assert.equal(calls,0);
 const review=await provider.evaluate({...request,posterReference:{id,sha256:createHash('sha256').update(bytes).digest('hex')}});assert.equal(calls,1);assert.equal(review.productFidelity?.level,'high');
 }finally{await storage.remove(id);}
});
