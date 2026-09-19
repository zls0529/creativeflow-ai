import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ComfyUIProvider, fillWorkflow, comfySizes } from '../lib/providers/image/comfyui';
import { getProviders } from '../lib/providers';
import { storage } from '../lib/storage';
import type { ImageRequest } from '../lib/providers/image/base';
import { selectWorkflow, qualityPrompts, anatomyNegatives, qualityBaseSizes } from '../lib/providers/image/quality';
const env = { COMFYUI_URL: 'http://127.0.0.1:8188', COMFYUI_CHECKPOINT_NAME: 'test.safetensors' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const request = { kind: 'hero', prompt: { subject: 'Unique ceramic mug', environment: 'studio', composition: 'right third', camera: '50mm', lighting: 'soft', colour_palette: 'blue', style: 'photo', brand_constraints: 'no text', negative_prompt: 'blur' } } as ImageRequest;
test('configuration requires URL/checkpoint and bounds settings', () => {
  assert.throws(() => new ComfyUIProvider({}), /Missing COMFYUI_URL/);
  assert.throws(() => new ComfyUIProvider({ COMFYUI_URL: env.COMFYUI_URL }), /Missing COMFYUI_CHECKPOINT_NAME/);
  assert.throws(() => new ComfyUIProvider({ ...env, COMFYUI_URL: 'file:///tmp' }), /HTTP/);
  assert.throws(() => new ComfyUIProvider({ ...env, COMFYUI_STEPS: '0' }), /COMFYUI_STEPS/);
});
test('selection preserves mock and explicitly selects ComfyUI', () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, env, { LLM_PROVIDER: 'mock', VISION_PROVIDER: 'mock', IMAGE_PROVIDER: 'comfyui' });
    assert.equal(getProviders().image.name, 'comfyui');
    process.env.IMAGE_PROVIDER = 'mock'; assert.equal(getProviders().image.name, 'mock');
  } finally { process.env = previous; }
});
test('template substitutes every value without mutating template; placement sizes', async () => {
  const template = JSON.parse(await readFile('comfyui/workflows/basic_text2img_api.json','utf8'));
  const values = { checkpoint: 'model', positive: 'quoted " prompt', negative: 'blur', width: 1024, height: 768, seed: 42, steps: 20, cfg: 7, sampler: 'euler', scheduler: 'normal' };
  const graph = fillWorkflow(template, values);
  assert.equal(graph['6'].inputs.text, values.positive); assert.equal(graph['7'].inputs.text, 'blur');
  assert.equal(graph['4'].inputs.ckpt_name, 'model'); assert.equal(graph['3'].inputs.seed, 42);
  assert.equal(template['3'].inputs.seed, '{{seed}}');
  assert.deepEqual(Object.values(comfySizes).map(s => [s.width,s.height]), [[1024,768],[1024,1024],[768,1344],[1536,512],[1024,1024]]);
  template['8'].inputs.vae = ['4',0]; assert.throws(() => fillWorkflow(template, values), /Invalid ComfyUI workflow template/);
});
test('submits one job, retrieves PNG and stores a local URL', async () => {
  let calls = 0;
  const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.write('IHDR',12); png.writeUInt32BE(1024,16); png.writeUInt32BE(768,20);
  global.fetch = async (url, init) => {
    calls++;
    if (String(url).endsWith('/prompt')) { const body = JSON.parse(String(init?.body)); assert.match(body.prompt['6'].inputs.text,/Unique ceramic mug/); assert.equal(body.prompt['3'].inputs.steps,20); return Response.json({ prompt_id: 'job-1' }); }
    if (String(url).includes('/history/')) return Response.json({ 'job-1': { status: { status_str:'success',completed:true }, outputs: { '9': { images:[{ filename:'image.png',subfolder:'',type:'output' }] } } } });
    assert.match(String(url), /\/view\?/); return new Response(png);
  };
  const result = await new ComfyUIProvider({...env,COMFYUI_SEED:'42'}).generate(request);
  assert.equal(result.reproducibility?.seed,42);assert.equal(result.reproducibility?.workflowId,'legacy_basic_v1');assert.equal(result.reproducibility?.registeredHashMatches,true);assert.equal(result.reproducibility?.sampling[0].steps,20);
  const file = result.imageUrl.split('/').at(-1)!;
  try { assert.equal(result.provider,'comfyui'); assert.deepEqual(await storage.getGenerated(file),png); assert.equal(calls,3); } finally { await storage.removeGenerated(file); }
});
test('unreachable server, rejected request and malformed response are explicit', async () => {
  global.fetch = async () => { throw new Error('network'); };
  await assert.rejects(new ComfyUIProvider(env).generate(request), /unreachable/);
  global.fetch = async () => new Response('', { status:400 });
  await assert.rejects(new ComfyUIProvider(env).generate(request), /HTTP 400/);
  global.fetch = async () => Response.json({});
  await assert.rejects(new ComfyUIProvider(env).generate(request), /Invalid ComfyUI workflow response/);
});
test('completed job without images fails; queued job times out without resubmission', async () => {
  global.fetch = async url => Response.json(String(url).endsWith('/prompt') ? { prompt_id:'job' } : { job: { status:{ status_str:'success',completed:true },outputs:{} } });
  await assert.rejects(new ComfyUIProvider(env).generate(request), /without a valid image output/);
  let submits = 0;
  global.fetch = async url => { if (String(url).endsWith('/prompt')) { submits++; return Response.json({ prompt_id:'job' }); } return Response.json({}); };
  await assert.rejects(new ComfyUIProvider({ ...env, COMFYUI_TIMEOUT_MS:'1000' }).generate(request), /timeout/);
  assert.equal(submits,1);
});

test('workflow selection respects overrides, human context and product-only placement', () => {
  const runner = { ...request, prompt: { ...request.prompt, subject: 'One runner in mid-stride' } };
  assert.equal(selectWorkflow('auto', runner).mode, 'sports');
  assert.equal(selectWorkflow('basic', runner).mode, 'basic');
  assert.equal(selectWorkflow('quality', request).mode, 'quality');
  assert.equal(selectWorkflow('auto', request).mode, 'basic');
  assert.equal(selectWorkflow('auto', { ...runner, prompt: { ...runner.prompt, subject: 'Product-only isolated running shoe, no people' } }).mode, 'basic');
  assert.equal(selectWorkflow('auto', { ...request, prompt: { ...request.prompt, negative_prompt: 'extra legs, runner, human' } }).mode, 'basic');
  assert.equal(selectWorkflow('auto', { ...request, direction: { visual_direction: 'An athlete running at night' } as ImageRequest['direction'] }).mode, 'sports');
});
test('quality prompt preserves subject, removes body blur and deduplicates anatomical negatives', () => {
  const prompt = { ...request.prompt, subject: 'A runner with motion blur on legs', negative_prompt: 'extra legs, watermark, BAD ANATOMY' };
  const result = qualityPrompts({ prompt });
  assert.match(result.positive, /A runner/); assert.doesNotMatch(result.positive, /motion blur on legs/);
  assert.match(result.positive, /natural running biomechanics/); assert.match(result.positive, /motion blur restricted to background/);
  for (const term of anatomyNegatives) assert.ok(result.negative.toLowerCase().includes(term));
  assert.equal(result.negative.toLowerCase().split('bad anatomy').length, 2);
  assert.equal(prompt.subject, 'A runner with motion blur on legs');
});
test('quality configuration rejects unknown workflow mode and excessive refinement denoise', () => {
  assert.throws(() => new ComfyUIProvider({ ...env, COMFYUI_WORKFLOW_MODE: 'pose-aware' }), /COMFYUI_WORKFLOW_MODE/);
  assert.throws(() => new ComfyUIProvider({ ...env, COMFYUI_REFINE_DENOISE: '0.8' }), /COMFYUI_REFINE_DENOISE/);
  assert.throws(() => new ComfyUIProvider({ ...env, COMFYUI_SEED: '-1' }), /COMFYUI_SEED/);
});
test('quality submits two stages with stable base sizes and does not fall back on rejection', async () => {
  let count = 0;
  global.fetch = async (_url, init) => {
    count++; const graph = JSON.parse(String(init?.body)).prompt;
    assert.equal(graph['5'].inputs.width, qualityBaseSizes.hero.width);
    assert.equal(graph['10'].inputs.width, 1024); assert.equal(graph['10'].inputs.crop, 'disabled');
    assert.deepEqual(graph['11'].inputs.latent_image, ['13',0]);
    assert.equal(graph['11'].inputs.denoise, 0.25); assert.equal(graph['11'].inputs.steps,16);
    assert.equal(graph['3'].inputs.steps,28); assert.equal(graph['3'].inputs.cfg,6);
    assert.equal(graph['3'].inputs.sampler_name,'dpmpp_2m'); assert.equal(graph['3'].inputs.scheduler,'karras');
    assert.equal(graph['3'].inputs.seed,42); assert.equal(graph['11'].inputs.seed,42);
    assert.match(graph['7'].inputs.text,/twisted ankles/);
    return new Response('',{status:400});
  };
  const provider = new ComfyUIProvider({ ...env, COMFYUI_WORKFLOW_MODE:'quality',COMFYUI_SEED:'42' });
  assert.match(provider.describe(request), /comfyui \/ quality/);
  await assert.rejects(provider.generate(request), /HTTP 400/); assert.equal(count,1);
});
