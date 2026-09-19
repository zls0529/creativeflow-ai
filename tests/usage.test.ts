import {test,beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '../lib/database/client';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {demoBrief} from '../lib/demo';
import {withUsageScope,measure,UsageLimitError} from '../lib/usage/capture';
import {pricing,responseTokens,estimate} from '../lib/usage/pricing';
import {usageReport,exportUsage} from '../lib/usage/report';
import {structuredResponse} from '../lib/providers/openai/responses';
import {OpenAILLMProvider} from '../lib/providers/llm/openai';
import {ComfyUIProvider} from '../lib/providers/image/comfyui';
import type {ImageRequest} from '../lib/providers/image/base';
import {storage} from '../lib/storage';
import {getProviders} from '../lib/providers';
import {runCampaign} from '../lib/agents/orchestrator';
import {executionContext} from '../lib/jobs/context';
import {GET} from '../app/api/usage/route';
import {OpenAIVisionProvider} from '../lib/providers/vision/openai';
import type {VisionRequest} from '../lib/providers/vision/base';
import sharp from 'sharp';
const env={...process.env},fetchOriginal=global.fetch,ids:string[]=[];
beforeEach(()=>{Object.assign(process.env,{OPENAI_API_KEY:'sk-test-private-usage',OPENAI_MODEL:'gpt-4.1-mini',LLM_PROVIDER:'mock',VISION_PROVIDER:'mock',IMAGE_PROVIDER:'mock',MAX_REFINEMENTS:'0',CRITIC_THRESHOLD:'80'});for(const key of ['MAX_CAMPAIGN_API_COST_USD','MAX_JOB_API_COST_USD','LOCAL_GPU_COST_PER_HOUR','OPENAI_PRICING_JSON'])delete process.env[key];global.fetch=async()=>{throw new Error('External network disabled');};});
afterEach(()=>{process.env={...env};global.fetch=fetchOriginal;});
after(async()=>{await db.campaign.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
async function fixture(){const c=await createCampaign({...demoBrief,name:'TEST-USAGE-'+randomUUID()});ids.push(c.id);return c.id;}
const usage={input_tokens:1000,input_tokens_details:{cached_tokens:400},output_tokens:100,total_tokens:1100};
const body=(extra:object={})=>({model:'gpt-4.1-mini-2025-04-14',usage,status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"value":"ok"}'}]}],...extra});
const request={name:'brand_profile',instruction:'Test',schema:z.object({value:z.string()}),input:'fixture'};
const config={apiKey:'sk-test-private-usage',model:'gpt-4.1-mini',timeoutMs:1000};
const responseCall=(id:string,extra:object={})=>withUsageScope({campaignId:id},()=>{global.fetch=async()=>Response.json(body(extra));return structuredResponse(request,config);});
test('cached tokens are a subset of input; missing/invalid counters stay unavailable',()=>{
 assert.equal(estimate(responseTokens(usage),pricing(config.model)),0.00044);
 assert.equal(estimate(responseTokens({input_tokens:100,output_tokens:10}),pricing(config.model)),null);
 assert.equal(responseTokens({input_tokens:-1}).inputTokens,null);
 assert.equal(estimate(responseTokens({...usage,input_tokens_details:{cached_tokens:1001}}),pricing(config.model)),null);
});
test('OpenAI LLM records authoritative usage and snapshot once without prompt/secret persistence',async()=>{
 const id=await fixture();global.fetch=async()=>Response.json(body({debug:'sk-test-private-usage'}));
 await withUsageScope({campaignId:id},()=>new OpenAILLMProvider().generate({...request,context:{secret:'not-for-history'},mock:()=>({value:'mock'})}));
 const r=await usageReport({campaignId:id});assert.equal(r.eventCount,1);assert.equal(r.events[0].inputTokens,1000);assert.equal(r.events[0].cachedTokens,400);assert.equal(r.events[0].totalTokens,1100);assert.equal(r.events[0].operation,'llm_brand_analysis');assert.equal(r.events[0].estimatedCostUsd,0.00044);assert.match(r.events[0].pricingSnapshot!,/2026-09-19/);
 const exported=await exportUsage({campaignId:id});assert.doesNotMatch(exported,/sk-test-private-usage|not-for-history|Authorization|debug/);
});
test('Vision response boundary records separate review linked to a generation',async()=>{
 const id=await fixture();global.fetch=async()=>Response.json(body({model:'gpt-4.1'}));
 await withUsageScope({campaignId:id,assetId:'asset-test',generationId:'generation-test'},()=>structuredResponse({...request,name:'vision_critic',vision:true},{...config,model:'gpt-4.1'}));
 const r=await usageReport({generationId:'generation-test'});assert.equal(r.eventCount,1);assert.equal(r.events[0].category,'vision');assert.equal(r.events[0].operation,'vision_review');assert.equal(r.events[0].estimatedCostUsd,0.0022);
});
test('actual Vision adapter uses the same single usage event after image preprocessing',async()=>{
 const id=await fixture(),file=randomUUID()+'.png';
 const clean={status:'clear',severity:'none',observation:'Clear silhouette.',interpretation:'Coherent product.',recommendation:'Keep layout.'};
 const output={brand_consistency:90,composition:90,visual_hierarchy:90,product_visibility:90,colour_consistency:90,campaign_relevance:90,visual_quality:90,prompt_adherence:90,integrity:{visible_people:0,...Object.fromEntries(['limb_plausibility','duplicated_limbs','leg_arm_anatomy','feet_ankles','hands','body_proportions','pose_plausibility','product_structure','duplicated_product_parts','product_prominence'].map(k=>[k,clean]))},blockingIssues:[],findings:[{observation:'Product visible.',interpretation:'Clear.',recommendation:'Keep.'}]};
 await storage.putGenerated(file,await sharp({create:{width:64,height:64,channels:3,background:'#334455'}}).png().toBuffer());
 process.env.VISION_MODEL='gpt-4.1';global.fetch=async()=>Response.json(body({model:'gpt-4.1',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
 try{await withUsageScope({campaignId:id},()=>new OpenAIVisionProvider().evaluate({imageUrl:'/api/generated/'+file,placement:'product',version:1,iteration:0,objective:'Launch',prompt:{subject:'Mug'},brand:{product:'Mug'},direction:{concept:'Mug'}} as VisionRequest));const r=await usageReport({campaignId:id});assert.equal(r.eventCount,1);assert.equal(r.events[0].category,'vision');assert.equal(r.events[0].status,'success');assert.equal(r.events[0].inputTokens,1000);}finally{await storage.removeGenerated(file);}
});
test('unknown models retain tokens but have no monetary estimate',async()=>{const id=await fixture();await responseCall(id,{model:'future-model'});const e=(await usageReport({campaignId:id})).events[0];assert.equal(e.estimatedCostUsd,null);assert.equal(e.inputTokens,1000);assert.equal(e.pricingSnapshot,null);});
test('configurable rates are snapshotted and invalid pricing is rejected without a call',async()=>{
 const id=await fixture();process.env.OPENAI_PRICING_JSON=JSON.stringify({'gpt-4.1-mini-2025-04-14':{inputPerMillion:1,cachedInputPerMillion:0.5,outputPerMillion:2}});await responseCall(id);assert.equal((await usageReport({campaignId:id})).events[0].estimatedCostUsd,0.001);
 process.env.OPENAI_PRICING_JSON='secret garbage';await assert.rejects(responseCall(id),/OPENAI_PRICING_JSON/);assert.equal((await usageReport({campaignId:id})).eventCount,1);
});
test('refusal, incomplete and schema failure keep returned paid usage; failures are not free',async()=>{
 const id=await fixture();for(const extra of [{status:'incomplete'},{output:[{type:'message',content:[{type:'refusal'}]}]},{output:[]}])await assert.rejects(responseCall(id,extra));
 const r=await usageReport({campaignId:id});assert.equal(r.eventCount,3);assert.equal(r.totals.failed,3);assert.ok(Math.abs(r.totals.apiCostUsd!-0.00132)<1e-12);
});
test('network/HTTP errors and missing usage have unknown cost; unsafe errors are never stored',async()=>{
 const id=await fixture();await assert.rejects(withUsageScope({campaignId:id},()=>structuredResponse(request,config)));
 global.fetch=async()=>Response.json({error:'sk-test-private-usage'},{status:401});await assert.rejects(withUsageScope({campaignId:id},()=>structuredResponse(request,config)));
 await responseCall(id,{usage:null});const r=await usageReport({campaignId:id});assert.equal(r.totals.unpricedApiCalls,3);assert.equal(r.totals.apiCostUsd,null);assert.doesNotMatch(await exportUsage({campaignId:id}),/sk-test-private-usage/);
});
test('HTTP failure with authoritative usage retains its cost',async()=>{
 const id=await fixture();global.fetch=async()=>Response.json(body(),{status:429});await assert.rejects(withUsageScope({campaignId:id},()=>structuredResponse(request,config)));const e=(await usageReport({campaignId:id})).events[0];assert.equal(e.status,'failed');assert.equal(e.estimatedCostUsd,0.00044);
});
test('nonstandard API service tier has unavailable cost rather than wrong standard rate',async()=>{const id=await fixture();await responseCall(id,{service_tier:'priority'});assert.equal((await usageReport({campaignId:id})).events[0].estimatedCostUsd,null);});
test('ComfyUI records one generation despite polling, dimensions/checkpoint and elapsed duration',async()=>{
 const id=await fixture(),png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1024,16);png.writeUInt32BE(768,20);
 let calls=0;global.fetch=async url=>{calls++;if(String(url).endsWith('/prompt'))return Response.json({prompt_id:'usage-job'});if(String(url).includes('/history/'))return Response.json({'usage-job':{status:{status_str:'success',completed:true},outputs:{'9':{images:[{filename:'image.png',subfolder:'',type:'output'}]}}}});return new Response(png);};
 const imageRequest={kind:'hero',version:1,prompt:{subject:'Mug',negative_prompt:'blur'}} as ImageRequest;
 const result=await withUsageScope({campaignId:id},()=>new ComfyUIProvider({COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture.safetensors'}).generate(imageRequest));
 try{const r=await usageReport({campaignId:id});assert.equal(calls,3);assert.equal(r.eventCount,1);assert.equal(r.totals.localCompleted,1);assert.ok(r.events[0].durationMs!>=0);assert.equal(r.events[0].estimatedCostUsd,null);assert.deepEqual(JSON.parse(r.events[0].metadata),{checkpoint:'fixture.safetensors',width:1024,height:768,workflow:'basic',plannedRefinementPasses:0,detailPasses:[],completedRefinementPasses:0});}finally{await storage.removeGenerated(result.imageUrl.split('/').at(-1)!);}
});
test('local optional rate is explicit and based on wall-clock; mock remains zero',async()=>{
 const id=await fixture();process.env.LOCAL_GPU_COST_PER_HOUR='2';await withUsageScope({campaignId:id},()=>measure('comfyui','image','comfyui_generation','fixture',async()=>{await new Promise(r=>setTimeout(r,10));}));
 const e=(await usageReport({campaignId:id})).events[0];assert.ok(Math.abs(e.estimatedCostUsd!-e.durationMs!/3600000*2)<1e-12);assert.match(e.pricingSnapshot!,/wall-clock/);
 await withUsageScope({campaignId:id},()=>getProviders().llm.generate({...request,context:{},mock:()=>({value:'mock'})}));assert.equal((await usageReport({campaignId:id})).totals.mockCalls,1);
});
test('whole mock refinement workflow records every call/version exactly once, job/attempt aggregation agrees',async()=>{
 const id=await fixture();process.env.MAX_REFINEMENTS='1';const jobId='usage-job-'+randomUUID();await executionContext.run({jobId,attempt:2,checkpoint:async()=>{},fence:async()=>{}},async()=>{
 // Supply the same lock ownership as a claimed job, without touching the global worker queue.
 await db.campaign.update({where:{id},data:{activeJobId:jobId}});await runCampaign(id,()=>{},undefined,getProviders());
 });
 const report=await usageReport({campaignId:id}),job=await usageReport({jobId,attempt:2}),campaign=(await getCampaign(id))!;
 assert.equal(report.eventCount,32);assert.equal(report.totals.refinementCalls,5);assert.equal(report.totals.mockCalls,32);assert.equal(report.totals.apiCostUsd,null);assert.deepEqual(report.totals,job.totals);assert.equal(report.events.filter(e=>e.category==='vision').length,10);assert.equal(report.events.filter(e=>e.category==='image').length,10);assert.ok(report.events.every(e=>e.estimatedCostUsd===0));assert.ok(campaign.assets.every(a=>a.generations.length===2));assert.equal(report.olderHistoryUnrecorded,false);
 for(const a of campaign.assets)for(const g of a.generations){const r=await usageReport({generationId:g.id});assert.equal(r.events.filter(e=>e.category==='image').length,1);assert.equal(r.events.filter(e=>e.category==='vision').length,1);}
});
test('unrecorded historical campaign is not reported as zero dollars',async()=>{const id=await fixture();const r=await usageReport({campaignId:id});assert.equal(r.eventCount,0);assert.equal(r.totals.apiCostUsd,null);assert.equal(r.totals.inputTokens,null);});
test('campaign soft limit stops the next paid call and unknown earlier costs block safely',async()=>{
 const id=await fixture();await responseCall(id);process.env.MAX_CAMPAIGN_API_COST_USD='0.0004';await assert.rejects(responseCall(id),UsageLimitError);assert.equal((await usageReport({campaignId:id})).eventCount,1);
 process.env.MAX_CAMPAIGN_API_COST_USD='1';await responseCall(id,{usage:null});await assert.rejects(responseCall(id),/unavailable cost/);
});
test('zero job budget blocks paid call; unset limits and mock do not impose a budget',async()=>{
 const id=await fixture();process.env.MAX_JOB_API_COST_USD='0';await executionContext.run({jobId:'budget-job',attempt:1,checkpoint:async()=>{},fence:async()=>{}},async()=>{
 await assert.rejects(responseCall(id),/limit reached/);await withUsageScope({campaignId:id},()=>getProviders().llm.generate({...request,context:{},mock:()=>({value:'mock'})}));
 });assert.equal((await usageReport({campaignId:id})).totals.mockCalls,1);
});
test('pending calls are durable and unknown-cost history prevents another paid call',async()=>{
 const id=await fixture();let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;}),wait=new Promise<void>(r=>{release=r;});
 const work=withUsageScope({campaignId:id},()=>measure('openai','text','llm_brand_analysis','gpt-4.1-mini',async()=>{entered();await wait;}));await started;
 const pending=await usageReport({campaignId:id});assert.equal(pending.totals.pending,1);assert.equal(pending.events[0].estimatedCostUsd,null);
 process.env.MAX_CAMPAIGN_API_COST_USD='1';try{await assert.rejects(responseCall(id),/unavailable cost/);}finally{release();await work;}
});
test('concurrent scopes do not leak campaign or generation associations',async()=>{
 const a=await fixture(),b=await fixture();await Promise.all([a,b].map((campaignId,i)=>withUsageScope({campaignId,generationId:'scope-'+i},()=>measure('mock','text','llm_refinement',null,async()=>{await new Promise(r=>setTimeout(r,5));}))));
 assert.equal((await usageReport({campaignId:a})).events[0].generationId,'scope-0');assert.equal((await usageReport({campaignId:b})).events[0].generationId,'scope-1');
});
test('export is valid JSON, includes associations/snapshot and API rejects invalid filters',async()=>{
 const id=await fixture();await responseCall(id);const r=await GET(new Request('http://localhost/api/usage?campaignId='+id+'&export=json'));assert.equal(r.status,200);assert.match(r.headers.get('content-disposition')!,/attachment/);const value=await r.json();assert.equal(value.events[0].campaignId,id);assert.equal(value.schemaVersion,1);assert.equal((await GET(new Request('http://localhost/api/usage?attempt=1'))).status,400);
});
