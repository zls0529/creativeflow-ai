import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/database/client';
import { createCampaign, getCampaign } from '../lib/database/campaigns';
import { runCampaign, withCampaignLock, BusyError } from '../lib/agents/orchestrator';
import { demoBrief } from '../lib/demo';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { MockImageProvider, renderMockAsset } from '../lib/providers/image/mock';
import { MockVisionProvider } from '../lib/providers/vision/mock';
import { refinementConfig } from '../lib/providers';
import type { Providers } from '../lib/providers';
import { detectMime } from '../lib/storage';
import { checkOrigin } from '../lib/api';
import { POST as uploadFiles } from '../app/api/campaigns/[id]/uploads/route';
import { GET as readUpload } from '../app/api/uploads/[id]/route';
import { POST as approveAsset } from '../app/api/campaigns/[id]/approve/route';
import { storage } from '../lib/storage';

const ids: string[] = [];
const providers = (): Providers => ({ llm: new MockLLMProvider(), image: new MockImageProvider(), vision: new MockVisionProvider() });
async function fixture() { const c = await createCampaign({ ...demoBrief, name: `TEST-${Date.now()}` }); ids.push(c.id); return c; }
after(async () => { await db.campaign.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });

test('blocking defects require review even when a custom threshold is lower than the score', async () => {
  const previousThreshold = process.env.CRITIC_THRESHOLD, previousMax = process.env.MAX_REFINEMENTS;
  process.env.CRITIC_THRESHOLD = '30'; process.env.MAX_REFINEMENTS = '0';
  try {
    const c = await fixture(); const p = providers();
    const evaluate = p.vision.evaluate.bind(p.vision);
    p.vision.evaluate = async request => ({ ...await evaluate(request), overall:49, blockingIssues:[{ category:'anatomy',severity:'high',observation:'Possible duplicated limb.',interpretation:'Visually inconsistent silhouette.',recommendation:'Use one runner with separated limbs.' }] });
    await runCampaign(c.id,()=>{},undefined,p);
    assert.ok((await getCampaign(c.id))!.assets.every(a=>a.status === 'needs_review'));
  } finally {
    if (previousThreshold === undefined) delete process.env.CRITIC_THRESHOLD; else process.env.CRITIC_THRESHOLD = previousThreshold;
    if (previousMax === undefined) delete process.env.MAX_REFINEMENTS; else process.env.MAX_REFINEMENTS = previousMax;
  }
});

test('complete workflow persists five coherent assets, feedback and refinements; rerun is idempotent', async () => {
  const c = await fixture();
  await runCampaign(c.id, () => {}, undefined, providers());
  const result = (await getCampaign(c.id))!;
  assert.equal(result.status, 'completed');
  assert.equal(result.assets.length, 5);
  assert.equal(result.brandProfile?.campaign_goal, demoBrief.objective);
  assert.equal(result.direction?.concept, c.name);
  for (const asset of result.assets) {
    assert.equal(asset.generations.length, 2);
    assert.equal(asset.generations[0].evaluation?.overall, 77);
    assert.equal(asset.generations[1].evaluation?.overall, 89);
    assert.match(asset.generations[1].reason, /below target/);
    assert.notEqual(asset.generations[0].prompt.composition, asset.generations[1].prompt.composition);
    assert.notEqual(asset.generations[0].imageUrl, asset.generations[1].imageUrl);
  }
  await runCampaign(c.id, () => {}, undefined, providers());
  assert.equal((await getCampaign(c.id))!.assets[0].generations.length, 2);
  const asset = result.assets[0];
  await runCampaign(c.id, () => {}, { assetId: asset.id, instruction: 'More clear space around the product' }, providers());
  const refined = (await getCampaign(c.id))!.assets[0];
  assert.equal(refined.generations.length, 4);
  assert.match(refined.generations[2].prompt.composition, /More clear space/);
  assert.equal(refined.generations[2].reason, 'Human direction: More clear space around the product');
});

test('persistent low scores stop at two automatic refinements and require human review', async () => {
  const c = await fixture(), p = providers();
  p.vision.evaluate = async () => ({ ...await new MockVisionProvider().evaluate({ iteration: 0 } as Parameters<MockVisionProvider['evaluate']>[0]), overall: 20 });
  await runCampaign(c.id, () => {}, undefined, p);
  const result = (await getCampaign(c.id))!;
  assert.ok(result.assets.every(a => a.generations.length === 3 && a.status === 'needs_review'));
});

test('provider failure is persisted, lock is released, and retry completes', async () => {
  const c = await fixture(), p = providers();
  p.image.generate = async () => { throw new Error('Test provider unavailable'); };
  await assert.rejects(runCampaign(c.id, () => {}, undefined, p), /Test provider unavailable/);
  const failed = (await getCampaign(c.id))!;
  assert.equal(failed.status, 'failed');
  assert.ok(failed.runs.some(r => r.status === 'failed'));
  assert.equal((await db.campaign.findUnique({ where: { id: c.id } }))?.lockAt, null);
  await runCampaign(c.id, () => {}, undefined, providers());
  assert.equal((await getCampaign(c.id))!.status, 'completed');
});

test('concurrent writes are rejected by the database lease', async () => {
  const c = await fixture();
  await withCampaignLock(c.id, async () => { await assert.rejects(withCampaignLock(c.id, async () => true), BusyError); });
});

test('configuration rejects values that could cause unbounded loops', () => {
  const original = process.env.MAX_REFINEMENTS;
  try { process.env.MAX_REFINEMENTS = '3'; assert.throws(refinementConfig, /MAX_REFINEMENTS/); }
  finally { if (original === undefined) delete process.env.MAX_REFINEMENTS; else process.env.MAX_REFINEMENTS = original; }
});

test('origin validation accepts Next internal localhost rewrites and rejects foreign origins', () => {
  assert.doesNotThrow(() => checkOrigin(new Request('http://localhost:3000/api/campaigns', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })));
  assert.throws(() => checkOrigin(new Request('http://localhost:3000/api/campaigns', { headers: { host: '127.0.0.1:3000', origin: 'https://example.com' } })), /Cross-origin/);
});

test('expired workflow leases recover into a retryable failure on refresh', async () => {
  const c = await fixture();
  await db.campaign.update({ where: { id: c.id }, data: { status: 'running', lockAt: new Date(Date.now() - 31 * 60 * 1000) } });
  assert.equal((await getCampaign(c.id))!.status, 'failed');
  await runCampaign(c.id, () => {}, undefined, providers());
  assert.equal((await getCampaign(c.id))!.status, 'completed');
});

test('uploads are identified by bytes, and SVG output escapes user text', async () => {
  assert.equal(detectMime(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(detectMime(Buffer.from('%PDF-1.7')), 'application/pdf');
  const c = await fixture(); await runCampaign(c.id, () => {}, undefined, providers());
  const result = (await getCampaign(c.id))!;
  const svg = renderMockAsset({ brandName: '<script>test</script>', brand: result.brandProfile!, direction: result.direction!,
    prompt: result.assets[0].prompt, kind: 'hero', width: 1600, height: 1200, version: 1, references: [] });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;SCRIPT&gt;'));
});

test('upload routes persist reference bytes and reject disguised unsupported files', async () => {
  const c = await fixture();
  const data = new FormData();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZ8AAAAASUVORK5CYII=', 'base64');
  data.append('logo', new File([png], 'test-logo.png', { type: 'image/png' }));
  const response = await uploadFiles(new Request(`http://localhost:3000/api/campaigns/${c.id}/uploads`, { method: 'POST', body: data }), { params: Promise.resolve({ id: c.id }) });
  assert.equal(response.status, 200);
  const file = (await getCampaign(c.id))!.uploads[0];
  try {
    const response = await readUpload(new Request('http://localhost:3000'), { params: Promise.resolve({ id: file.id }) });
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  } finally { await storage.remove(file.id); }
  const bad = new FormData(); bad.append('logo', new File(['<script>bad</script>'], 'fake.png', { type: 'image/png' }));
  assert.equal((await uploadFiles(new Request(`http://localhost:3000/api/campaigns/${c.id}/uploads`, { method: 'POST', body: bad }), { params: Promise.resolve({ id: c.id }) })).status, 400);
});

test('approval persists on the latest generation and regeneration requires new approval', async () => {
  const c = await fixture(); await runCampaign(c.id, () => {}, undefined, providers());
  const asset = (await getCampaign(c.id))!.assets[0];
  const response = await approveAsset(new Request(`http://localhost:3000/api/campaigns/${c.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, generationId: asset.generations.at(-1)!.id }) }), { params: Promise.resolve({ id: c.id }) });
  assert.equal(response.status, 200);
  assert.equal((await getCampaign(c.id))!.assets[0].status, 'approved');
  await runCampaign(c.id, () => {}, { assetId: asset.id }, providers());
  assert.equal((await getCampaign(c.id))!.assets[0].status, 'ready');
  const stale = await approveAsset(new Request(`http://localhost:3000/api/campaigns/${c.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, generationId: asset.generations.at(-1)!.id }) }), { params: Promise.resolve({ id: c.id }) });
  assert.equal(stale.status, 409);
});
