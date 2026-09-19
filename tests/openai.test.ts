import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { OpenAILLMProvider, OpenAIProviderError } from '../lib/providers/llm/openai';
import { getProviders } from '../lib/providers';
import { analyseBrand, directCampaign, engineerPrompt, refinePrompt } from '../lib/agents/creative';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { demoBrief } from '../lib/demo';
import { assetSpecs, brandSchema, directionSchema, promptSchema, type Evaluation } from '../types/campaign';

const variables = ['LLM_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_TIMEOUT_MS', 'IMAGE_PROVIDER', 'VISION_PROVIDER'] as const;
let original: Record<string, string | undefined>;
beforeEach(() => {
  original = Object.fromEntries(variables.map(k => [k, process.env[k]]));
  Object.assign(process.env, { LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'unit-test-secret-never-send', OPENAI_MODEL: 'configured-test-model', OPENAI_TIMEOUT_MS: '60000', IMAGE_PROVIDER: 'mock', VISION_PROVIDER: 'mock' });
  // Fail closed: automated tests cannot call the real fetch implementation, even with a local API key.
  mock.method(globalThis, 'fetch', async () => { throw new Error('Network disabled in automated tests'); });
});
afterEach(() => {
  mock.restoreAll();
  for (const k of variables) { if (original[k] === undefined) delete process.env[k]; else process.env[k] = original[k]; }
});
const request = { name: 'test_output', instruction: 'Return a structured answer.', context: { brief: 'test' }, schema: z.object({ answer: z.string() }), mock: () => { throw new Error('Mock fallback must never run'); } };
const completed = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
function respond(value: unknown, status = 200) { mock.method(globalThis, 'fetch', async () => Response.json(value, { status })); }
const errorCode = (code: string) => (error: unknown) => error instanceof OpenAIProviderError && error.code === code && !error.message.includes('unit-test-secret');

test('selection uses OpenAI only when selected; mock needs no credentials and images/vision remain mock', () => {
  const p = getProviders();
  assert.ok(p.llm instanceof OpenAILLMProvider);
  assert.equal(p.image.name, 'mock'); assert.equal(p.vision.name, 'mock');
  delete process.env.OPENAI_API_KEY;
  assert.throws(getProviders, errorCode('configuration'));
  process.env.LLM_PROVIDER = 'mock'; assert.ok(getProviders().llm instanceof MockLLMProvider);
  delete process.env.LLM_PROVIDER; assert.equal(getProviders().llm.name, 'mock');
  process.env.LLM_PROVIDER = 'unsupported'; assert.throws(getProviders, /Unsupported LLM_PROVIDER/);
});

test('model and timeout configuration reject blank/invalid values before fetching', () => {
  process.env.OPENAI_MODEL = ' '; assert.throws(() => new OpenAILLMProvider(), errorCode('configuration'));
  process.env.OPENAI_MODEL = 'configured-test-model';
  for (const value of ['', 'NaN', '-1', '999', '120001', '2000.5']) {
    process.env.OPENAI_TIMEOUT_MS = value;
    assert.throws(() => new OpenAILLMProvider(), errorCode('configuration'));
  }
});

test('Responses API uses configured model, strict JSON schema, server header and validated data', async () => {
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'configured-test-model'); assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true); assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(body.text.format.schema.required, ['answer']);
    assert.deepEqual(JSON.parse(body.input), request.context);
    assert.ok(!String(init.body).includes('unit-test-secret'));
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer unit-test-secret-never-send');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(completed({ answer: 'Validated result' }));
  });
  assert.deepEqual(await new OpenAILLMProvider().generate(request), { answer: 'Validated result' });
});

for (const [status, code] of [[401, 'authentication'], [429, 'rate_limit'], [408, 'timeout'], [504, 'timeout'], [403, 'request'], [500, 'request']] as const) {
  test(`HTTP ${status} becomes safe ${code} error without fallback or upstream text`, async () => {
    respond({ error: { message: 'unit-test-secret-never-send' } }, status);
    await assert.rejects(new OpenAILLMProvider().generate(request), errorCode(code));
  });
}

for (const [label, body, code] of [
  ['refusal', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'untrusted text' }] }] }, 'refused'],
  ['incomplete', { ...completed({ answer: 'partial' }), status: 'incomplete' }, 'incomplete'],
  ['failed response', { status: 'failed' }, 'incomplete'],
  ['wrong envelope', { status: 42 }, 'malformed_output'],
  ['no output', { status: 'completed', output: [] }, 'malformed_output'],
  ['schema mismatch', completed({ answer: 42 }), 'malformed_output'],
  ['missing required field', completed({}), 'malformed_output'],
  ['invalid model JSON', { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] }, 'malformed_output']
] as const) {
  test(`${label} is rejected`, async () => { respond(body); await assert.rejects(new OpenAILLMProvider().generate(request), errorCode(code)); });
}

test('invalid HTTP response JSON and transport failures are sanitized', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('not json'));
  await assert.rejects(new OpenAILLMProvider().generate(request), errorCode('malformed_output'));
  mock.method(globalThis, 'fetch', async () => { throw new Error('unit-test-secret-never-send'); });
  await assert.rejects(new OpenAILLMProvider().generate(request), errorCode('network'));
});

test('the configured deadline aborts a pending request', async () => {
  process.env.OPENAI_TIMEOUT_MS = '1000';
  mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('Deadline failed')), 3000);
    init.signal!.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal!.reason); }, { once: true });
  }));
  await assert.rejects(new OpenAILLMProvider().generate(request), errorCode('timeout'));
});

test('all four agents use the adapter; schemas validate and campaign history is excluded', async () => {
  const mockLLM = new MockLLMProvider();
  const brand = await analyseBrand(mockLLM, demoBrief, []);
  const direction = await directCampaign(mockLLM, demoBrief, brand);
  const prompt = await engineerPrompt(mockLLM, brand, direction, assetSpecs[0]);
  const fixtures: Record<string, unknown> = { brand_profile: brand, creative_direction: direction, image_prompt: prompt, refined_prompt: { prompt: { ...prompt, composition: 'A revised composition returned by the transport fixture.' }, reason:'Increase negative space around the product.',targetedCorrections:['Move the product to preserve a clear copy area.'] } };
  const names: string[] = [];
  mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); names.push(body.text.format.name);
    assert.ok(!body.input.includes('HISTORY_MUST_NOT_BE_SENT'));
    if (body.text.format.name === 'creative_direction') assert.deepEqual(JSON.parse(body.input).brand, brand);
    if (body.text.format.name === 'image_prompt') assert.equal(JSON.parse(body.input).placement.kind, 'hero');
    return Response.json(completed(fixtures[body.text.format.name]));
  });
  const provider = getProviders().llm;
  const fullCampaign = { ...demoBrief, assets: ['HISTORY_MUST_NOT_BE_SENT'], runs: ['HISTORY_MUST_NOT_BE_SENT'] };
  const actualBrand = await analyseBrand(provider, fullCampaign, []);
  brandSchema.parse(actualBrand);
  const actualDirection = await directCampaign(provider, fullCampaign, actualBrand);
  directionSchema.parse(actualDirection);
  const actualPrompt = await engineerPrompt(provider, actualBrand, actualDirection, assetSpecs[0]);
  promptSchema.parse(actualPrompt);
  const refined = await refinePrompt(provider, actualPrompt, { overall: 70, feedback: ['More negative space'] } as Evaluation, {placement:'hero',brand,direction,originalPrompt:prompt,workflowMode:'basic',generationId:'fixture',version:1});
  assert.notEqual(refined.prompt.composition, actualPrompt.composition);
  assert.deepEqual(names, ['brand_profile', 'creative_direction', 'image_prompt', 'refined_prompt']);
});

test('an OpenAI failure persists a safe campaign error without mock outputs or retry', async () => {
  const { db } = await import('../lib/database/client');
  const { createCampaign, getCampaign } = await import('../lib/database/campaigns');
  const { runCampaign } = await import('../lib/agents/orchestrator');
  const campaign = await createCampaign({ ...demoBrief, name: 'TEST-OpenAI-failure' });
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { message: 'unit-test-secret-never-send' } }, { status: 401 }); });
  try {
    await assert.rejects(runCampaign(campaign.id), errorCode('authentication'));
    const saved = (await getCampaign(campaign.id))!;
    assert.equal(saved.status, 'failed'); assert.equal(saved.brandProfile, null);
    assert.equal(saved.assets.length, 0); assert.equal(calls, 1);
    assert.ok(saved.runs.some(r => r.stage === 'Brand Analysis' && r.status === 'failed'));
    assert.ok(!JSON.stringify(saved).includes('unit-test-secret'));
    assert.match(saved.error!, /401/);
  } finally { await db.campaign.delete({ where: { id: campaign.id } }); await db.$disconnect(); }
});
