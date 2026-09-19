import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {ComfyUIProvider,fillWorkflow} from '../lib/providers/image/comfyui';
import {openPoseModel,poseReference,validatePoseImage,validateDetectedPose} from '../lib/providers/image/pose';
import {storage} from '../lib/storage';
import type {ImageRequest} from '../lib/providers/image/base';
const env={COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture',COMFYUI_WORKFLOW_MODE:'auto'};
const request={prompt:{subject:'One athlete running',composition:'Full body',environment:'Street',style:'Photo',negative_prompt:'blur'},direction:{},kind:'hero',references:[]} as unknown as ImageRequest;
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
const capabilities=()=>Object.fromEntries(['LoadImage','OpenposePreprocessor','ControlNetLoader','ControlNetApplyAdvanced'].map(n=>[n,{input:{required:n==='ControlNetLoader'?{control_net_name:[[openPoseModel]]}:{}}}]));
async function withReference(work:(r:ImageRequest)=>Promise<void>){
  const id=randomUUID();await storage.put(id,await sharp({create:{width:128,height:128,channels:3,background:'white'}}).png().toBuffer());
  try{await work({...request,references:[{id,role:'pose',mime:'image/png'}]});}finally{await storage.remove(id);}
}
test('auto uses sports without reference; explicit pose requires reference',async()=>{
  const selected=await new ComfyUIProvider(env).resolveWorkflow(request);assert.equal(selected.mode,'sports');assert.match(selected.reason,/no pose reference/);
  await assert.rejects(new ComfyUIProvider({...env,COMFYUI_WORKFLOW_MODE:'sports_pose'}).resolveWorkflow(request),/requires a pose reference/);
});
test('stored pose and available dependencies select sports_pose, including sports refinement preference',async()=>withReference(async r=>{
  global.fetch=async()=>Response.json(capabilities());
  const p=new ComfyUIProvider(env);assert.equal((await p.resolveWorkflow(r)).mode,'sports_pose');assert.match(p.describe(r),/sports_pose/);
  assert.equal((await new ComfyUIProvider(env).resolveWorkflow({...r,qualityPreference:{mode:'sports',reason:'Ankle blocker'}})).mode,'sports_pose');
  assert.equal((await new ComfyUIProvider({...env,COMFYUI_WORKFLOW_MODE:'sports'}).resolveWorkflow(r)).mode,'sports');
  assert.equal((await new ComfyUIProvider(env).resolveWorkflow({...r,prompt:{...r.prompt,subject:'Product-only isolated shoe'}})).mode,'basic');
}));
test('missing ControlNet and malformed dependencies fail without queuing or silent downgrade',async()=>withReference(async r=>{
  let calls=0;global.fetch=async url=>{calls++;assert.match(String(url),/object_info$/);const c=capabilities();c.ControlNetLoader.input.required={control_net_name:[[]]};return Response.json(c);};
  await assert.rejects(new ComfyUIProvider(env).generate(r),/not installed.*No downgrade/);assert.equal(calls,1);
  global.fetch=async()=>Response.json({});await assert.rejects(new ComfyUIProvider(env).resolveWorkflow(r),/missing node/);
}));
test('pose reference validation rejects traversal, duplicates, wrong format and corrupt bytes',async()=>{
  assert.throws(()=>poseReference({...request,references:[{id:'../secret',role:'pose',mime:'image/png'}]}),/Invalid pose/);
  assert.throws(()=>poseReference({...request,references:[{id:'a',role:'pose',mime:'image/png'},{id:'b',role:'pose',mime:'image/png'}]}),/only one/);
  await assert.rejects(validatePoseImage(Buffer.from('not an image')),/Invalid pose reference/);
  await assert.rejects(validatePoseImage(await sharp({create:{width:32,height:32,channels:3,background:'white'}}).png().toBuffer()),/Invalid pose/);
  await assert.rejects(new ComfyUIProvider(env).resolveWorkflow({...request,references:[{id:randomUUID(),role:'pose',mime:'image/png'}]}),/missing from project storage/);
});
test('pose configuration rejects incompatible models and invalid intervals',()=>{
  for(const config of [{COMFYUI_OPENPOSE_MODEL:'flux.safetensors'},{COMFYUI_POSE_STRENGTH:'0'},{COMFYUI_POSE_START_PERCENT:'0.9',COMFYUI_POSE_END_PERCENT:'0.8'}])assert.throws(()=>new ComfyUIProvider({...env,...config}),/COMFYUI_/);
});
test('pose template adds body-only conditioning solely to base sampler, retaining sports refinements',async()=>{
  const template=JSON.parse(await readFile('comfyui/workflows/sports_pose_api.json','utf8'));
  const values={checkpoint:'fixture',positive:'runner',negative:'blur',width:1024,height:768,base_width:768,base_height:576,seed:42,steps:32,cfg:5.5,sampler:'dpmpp_2m',scheduler:'karras',refine_steps:18,denoise:0.22,face_detector:'bbox/face_yolov8m.pt',face_steps:16,face_denoise:0.22,pose_image:'pose.png',openpose_model:openPoseModel,pose_strength:0.8,pose_start:0,pose_end:0.85};
  const g=fillWorkflow(template,values,'sports_pose');assert.deepEqual(g['3'].inputs.positive,['33',0]);assert.deepEqual(g['11'].inputs.positive,['6',0]);assert.equal(g['31'].inputs.detect_face,'disable');assert.deepEqual(g['9'].inputs.images,['21',0]);assert.deepEqual(g['3'].inputs.latent_image,['5',0]);
  template['31'].inputs.image=['8',0];assert.throws(()=>fillWorkflow(template,values,'sports_pose'),/Invalid sports_pose/);
});
test('pose success requires one detected body with hips, knees and ankles',()=>{
  const points: number[]=Array.from({length:54},(_,i)=>i%3===2?1:0.5);
  const output=(people:unknown[])=>({openpose_json:[JSON.stringify([{people}])]});
  assert.doesNotThrow(()=>validateDetectedPose(output([{pose_keypoints_2d:points}])));
  assert.throws(()=>validateDetectedPose(output([])),/one complete/);
  points[32]=0;assert.throws(()=>validateDetectedPose(output([{pose_keypoints_2d:points}])),/one complete/);
});
test('pose generation uploads sanitized reference, submits one job and persists normal image output',async()=>withReference(async r=>{
  const template=JSON.parse(await readFile('comfyui/workflows/sports_pose_api.json','utf8'));
  const caps={...Object.fromEntries(Object.values(template as Record<string,{class_type:string}>).map(n=>[n.class_type,{input:{required:{}}}])),...capabilities()};
  const bytes=await sharp({create:{width:1024,height:768,channels:3,background:'black'}}).png().toBuffer();
  let jobs=0,uploads=0;
  global.fetch=async (url,init)=>{
    const endpoint=String(url);
    if(endpoint.endsWith('/object_info'))return Response.json(caps);
    if(endpoint.endsWith('/upload/image')){uploads++;assert.ok(init?.body instanceof FormData);return Response.json({name:'pose-test.png',subfolder:'',type:'input'});}
    if(endpoint.endsWith('/prompt')){jobs++;const g=JSON.parse(String(init?.body)).prompt;assert.equal(g['30'].inputs.image,'pose-test.png');assert.deepEqual(g['3'].inputs.positive,['33',0]);return Response.json({prompt_id:'pose-job'});}
    if(endpoint.endsWith('/history/pose-job'))return Response.json({'pose-job':{status:{status_str:'success',completed:true},outputs:{'31':{openpose_json:[JSON.stringify([{people:[{pose_keypoints_2d:Array.from({length:54},(_,i)=>i%3===2?1:0.5)}]}])]},'9':{images:[{filename:'result.png',subfolder:'',type:'output'}]},'24':{images:[{filename:'before.png',subfolder:'',type:'output'}]}}}});
    if(endpoint.includes('/view?'))return new Response(new Uint8Array(bytes));
    throw new Error('Unexpected request');
  };
  const result=await new ComfyUIProvider(env).generate(r);
  try {assert.equal(jobs,1);assert.equal(uploads,1);assert.match(result.imageUrl,/^\/api\/generated\//);assert.ok(result.detailPasses?.some(x=>x.includes('Pose conditioning applied')));assert.ok(result.detailPasses?.some(x=>x.includes('strength 0.8')));}finally{await storage.removeGenerated(result.imageUrl.split('/').at(-1)!);}
}));
