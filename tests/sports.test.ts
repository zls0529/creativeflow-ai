import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ComfyUIProvider,fillWorkflow} from '../lib/providers/image/comfyui';
import {selectWorkflow} from '../lib/providers/image/quality';
import {sportsPrompts,sportsNegatives,refinementWorkflowPreference} from '../lib/providers/image/sports';
import type {ImageRequest} from '../lib/providers/image/base';
import type {Evaluation} from '../types/campaign';
const env={COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture',COMFYUI_WORKFLOW_MODE:'sports'};
const request={prompt:{subject:'One runner running at night',composition:'Full body',environment:'Street',camera:'50mm',lighting:'Soft rim',colour_palette:'Blue',style:'Photo',brand_constraints:'No logos',negative_prompt:'extra limbs'},direction:{},kind:'hero'} as ImageRequest;
const originalFetch=global.fetch;afterEach(()=>{global.fetch=originalFetch;});
test('sports selection preserves explicit basic/quality and excludes isolated product shots',()=>{
  assert.equal(selectWorkflow('auto',request).mode,'sports');assert.equal(selectWorkflow('basic',request).mode,'basic');assert.equal(selectWorkflow('quality',request).mode,'quality');
  assert.equal(selectWorkflow('auto',{...request,prompt:{...request.prompt,subject:'Product-only isolated running shoe'}}).mode,'basic');
  const evaluation={blockingIssues:[{category:'product',observation:'Deformed shoe',recommendation:'Clarify the shoe'}]} as Evaluation;
  assert.equal(refinementWorkflowPreference(evaluation,request)?.mode,'sports');
  assert.equal(new ComfyUIProvider({...env,COMFYUI_WORKFLOW_MODE:'basic'}).workflow({...request,qualityPreference:{mode:'sports',reason:'shoe blocker'}}).mode,'sports');
});
test('sports conditioning keeps the scene and adds foot, shoe, face and single-person constraints',()=>{
  const p=sportsPrompts(request);assert.match(p.positive,/One runner running at night/);assert.match(p.positive,/realistic face/);assert.match(p.positive,/anatomically plausible ankles/);assert.match(p.positive,/Motion blur restricted to background/);
  for(const word of sportsNegatives)assert.ok(p.negative.includes(word));assert.equal(p.negative.split('extra limbs').length,2);
});
test('sports settings reject excessive denoise and invalid boolean',()=>{
  assert.throws(()=>new ComfyUIProvider({...env,COMFYUI_SPORTS_FACE_DENOISE:'0.9'}),/COMFYUI_SPORTS_FACE_DENOISE/);
  assert.throws(()=>new ComfyUIProvider({...env,COMFYUI_SPORTS_FACE_DETAIL:'maybe'}),/true or false/);
  assert.throws(()=>new ComfyUIProvider({...env,COMFYUI_SPORTS_STEPS:'0'}),/COMFYUI_SPORTS_STEPS/);
});
test('sports template has image refinement plus a masked face pass; disabling face is explicit',async()=>{
  const template=JSON.parse(await readFile('comfyui/workflows/sports_api.json','utf8'));
  const values={checkpoint:'fixture',positive:'runner',negative:'blur',width:1024,height:768,base_width:768,base_height:576,seed:42,steps:32,cfg:5.5,sampler:'dpmpp_2m',scheduler:'karras',refine_steps:18,denoise:0.22,face_detector:'bbox/face_yolov8m.pt',face_steps:16,face_denoise:0.22};
  const graph=fillWorkflow(template,values,'sports');assert.deepEqual(graph['9'].inputs.images,['21',0]);assert.equal(graph['21'].inputs.denoise,0.22);assert.equal(graph['21'].inputs.cycle,1);assert.equal(graph['21'].inputs.noise_mask,true);
  const noFace=fillWorkflow(template,values,'sports',false);assert.equal(noFace['21'],undefined);assert.deepEqual(noFace['9'].inputs.images,['8',0]);
  template['21'].inputs.image=['3',0];assert.throws(()=>fillWorkflow(template,values,'sports'),/Invalid sports/);
});
test('missing local detailer dependencies fail before any queued job, without downgrade',async()=>{
  let calls=0;global.fetch=async url=>{calls++;assert.match(String(url),/object_info$/);return Response.json({});};
  await assert.rejects(new ComfyUIProvider(env).generate(request),/Sports workflow unavailable.*missing node/);assert.equal(calls,1);
});
