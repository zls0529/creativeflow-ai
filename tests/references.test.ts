import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ComfyUIProvider,fillWorkflow} from '../lib/providers/image/comfyui';
import {MockImageProvider} from '../lib/providers/image/mock';
import {selectedReferences,validateReferenceImage} from '../lib/providers/image/references';
import {applyReferenceWorkflow,defaultAdapter,defaultEncoder} from '../lib/providers/image/reference-workflow';
import {storage} from '../lib/storage';
import type {ImageRequest} from '../lib/providers/image/base';
import {selectWorkflow} from '../lib/providers/image/quality';
const env={COMFYUI_URL:'http://127.0.0.1:8188',COMFYUI_CHECKPOINT_NAME:'fixture',COMFYUI_WORKFLOW_MODE:'basic'};
const request={kind:'hero',prompt:{subject:'Isolated product-only shoe',composition:'Close up',negative_prompt:'blur'},direction:{},references:[]} as unknown as ImageRequest;
const originalFetch=global.fetch;afterEach(()=>{global.fetch=originalFetch;});
test('auto product close-up ignores campaign-level running context, preserving explicit modes',()=>{
  const r={...request,kind:'product' as const,prompt:{...request.prompt,subject:'Close-up of a lightweight running shoe'},direction:{visual_direction:'One runner running at night'} as ImageRequest['direction']};
  assert.equal(selectWorkflow('auto',r).mode,'basic');
  assert.equal(selectWorkflow('sports',r).mode,'sports');
  assert.equal(selectWorkflow('auto',{...r,prompt:{...r.prompt,subject:'One athlete running with shoes'}}).mode,'sports');
});
async function withReference(work:(r:ImageRequest)=>Promise<void>){const id=randomUUID();await storage.put(id,await sharp({create:{width:128,height:96,channels:3,background:'white'}}).png().toBuffer());try{await work({...request,references:[{id,role:'product',mime:'image/png'}]});}finally{await storage.remove(id);}}
test('product and legacy style references use separate defaults; pose/logo remain independent',()=>{
  const r={...request,references:[{id:'p',role:'product',mime:'image/png'},{id:'s',role:'reference',mime:'image/png'},{id:'pose',role:'pose',mime:'image/png'},{id:'logo',role:'logo',mime:'image/png'}]};
  assert.deepEqual(selectedReferences(r).map(x=>[x.role,x.strength,x.weightType]),[['style',0.4,'style transfer'],['product',0.8,'linear']]);
  assert.equal(selectedReferences({...r,conditioningStrength:{product:1.1}})[1].strength,1.1);
  assert.deepEqual(selectedReferences(request),[]);
});
test('ambiguous, cross-campaign, unsafe and unsupported references and strengths fail explicitly',()=>{
  assert.throws(()=>selectedReferences({...request,references:[{id:'p',role:'product',mime:'image/png'},{id:'q',role:'product',mime:'image/png'}]}),/Multiple product/);
  assert.throws(()=>selectedReferences({...request,productReference:{id:'outside',mime:'image/png'}}),/does not belong/);
  assert.throws(()=>selectedReferences({...request,references:[{id:'../secret',role:'product',mime:'image/png'}]}),/Invalid product/);
  assert.throws(()=>selectedReferences({...request,conditioningStrength:{product:0}}));
  assert.throws(()=>selectedReferences({...request,conditioningStrength:{style:1.5}}));
});
test('reference decoding rejects corrupt files and preserves full image in a square CLIP input',async()=>{
  await assert.rejects(validateReferenceImage(Buffer.from('fake png')),/Invalid reference/);
  const normalized=await validateReferenceImage(await sharp({create:{width:512,height:128,channels:3,background:'red'}}).png().toBuffer());
  const m=await sharp(normalized).metadata();assert.equal(m.width,768);assert.equal(m.height,768);
});
test('reference extension composes with every workflow, retains pose and leaves face model untouched',async()=>{
  const extension=JSON.parse(await readFile('comfyui/workflows/reference_conditioning_api.json','utf8'));
  const values={checkpoint:'fixture',positive:'shoe',negative:'blur',width:1024,height:768,base_width:768,base_height:576,seed:42,steps:20,cfg:7,sampler:'euler',scheduler:'normal',refine_steps:18,denoise:0.22,face_detector:'face.pt',face_steps:16,face_denoise:0.22,pose_image:'pose.png',openpose_model:'pose.safetensors',pose_strength:0.8,pose_start:0,pose_end:0.85};
  for(const [mode,file] of [['basic','basic_text2img_api.json'],['quality','human_quality_api.json'],['sports','sports_api.json'],['sports_pose','sports_pose_api.json']] as const){
    const base=fillWorkflow(JSON.parse(await readFile('comfyui/workflows/'+file,'utf8')),values,mode);const original=structuredClone(base);
    assert.equal(applyReferenceWorkflow(base,null,[],defaultAdapter,defaultEncoder),base);
    const graph=applyReferenceWorkflow(base,extension,[{role:'product',image:'p.png',strength:0.8},{role:'style',image:'s.png',strength:0.4}],defaultAdapter,defaultEncoder);
    assert.deepEqual(base,original);assert.deepEqual(graph['3'].inputs.model,['43',0]);assert.deepEqual(graph['43'].inputs.model,['45',0]);assert.equal(graph['45'].inputs.weight_type,'style transfer');
    if(graph['11'])assert.deepEqual(graph['11'].inputs.model,['43',0]);if(graph['21'])assert.deepEqual(graph['21'].inputs.model,['4',0]);if(graph['33'])assert.deepEqual(graph['3'].inputs.positive,['33',0]);
  }
  extension['43'].inputs.weight_type='style transfer';assert.throws(()=>applyReferenceWorkflow({'3':{class_type:'KSampler',inputs:{}}},extension,[{role:'product',image:'p.png',strength:0.8}],defaultAdapter,defaultEncoder),/Invalid reference conditioning template/);
});
test('missing models fail before uploads or queued jobs; mock never ignores active references',async()=>withReference(async r=>{
  let calls=0;global.fetch=async url=>{calls++;assert.match(String(url),/object_info$/);return Response.json({});};
  await assert.rejects(new ComfyUIProvider(env).generate(r),/Reference conditioning unavailable/);assert.equal(calls,1);
  await assert.rejects(new MockImageProvider().generate(r),/cannot apply/);
}));
test('live-shaped mocked reference generation uploads once, patches the sampler and records provenance',async()=>withReference(async r=>{
  const capabilities:Record<string,unknown>=Object.fromEntries(['LoadImage','IPAdapterModelLoader','CLIPVisionLoader','IPAdapterAdvanced','KSampler','CheckpointLoaderSimple','EmptyLatentImage','CLIPTextEncode','VAEDecode','SaveImage'].map(n=>[n,{input:{required:{}}}]));
  capabilities.IPAdapterModelLoader={input:{required:{ipadapter_file:[[defaultAdapter]]}}};capabilities.CLIPVisionLoader={input:{required:{clip_name:[[defaultEncoder]]}}};capabilities.IPAdapterAdvanced={input:{required:{weight_type:[['linear','style transfer']]}}};
  const bytes=await sharp({create:{width:1024,height:768,channels:3,background:'black'}}).png().toBuffer();let jobs=0,uploads=0;
  global.fetch=async(url,init)=>{
    const endpoint=String(url);if(endpoint.endsWith('/object_info'))return Response.json(capabilities);
    if(endpoint.endsWith('/upload/image')){uploads++;return Response.json({name:'reference.png',subfolder:'',type:'input'});}
    if(endpoint.endsWith('/prompt')){jobs++;const graph=JSON.parse(String(init?.body)).prompt;assert.deepEqual(graph['3'].inputs.model,['43',0]);assert.equal(graph['42'].inputs.image,'reference.png');assert.equal(graph['43'].inputs.weight,0.8);return Response.json({prompt_id:'reference-job'});}
    if(endpoint.endsWith('/history/reference-job'))return Response.json({'reference-job':{status:{status_str:'success',completed:true},outputs:{'9':{images:[{filename:'result.png',subfolder:'',type:'output'}]}}}});
    if(endpoint.includes('/view?'))return new Response(new Uint8Array(bytes));throw new Error('Unexpected request');
  };
  const result=await new ComfyUIProvider(env).generate(r);try{assert.equal(jobs,1);assert.equal(uploads,1);assert.equal(result.referenceConditioning?.references[0].id,r.references[0].id);assert.match(result.referenceConditioning!.references[0].sha256,/^[a-f0-9]{64}$/);}finally{await storage.removeGenerated(result.imageUrl.split('/').at(-1)!);}
}));
