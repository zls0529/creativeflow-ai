// Explicit live smoke test, never included in npm test. Reuses one saved prompt.
import { db } from '../lib/database/client';
import { runCampaign } from '../lib/agents/orchestrator';
import { getCampaign } from '../lib/database/campaigns';
async function main() {
  const [campaignId, assetId] = process.argv.slice(2);
  if (!campaignId || !assetId || process.env.IMAGE_PROVIDER !== 'comfyui' || process.env.VISION_PROVIDER !== 'mock') throw new Error('Supply campaign ID and asset ID with IMAGE_PROVIDER=comfyui and VISION_PROVIDER=mock.');
  const before = await getCampaign(campaignId);
  if (!before?.brandProfile || !before.direction || !before.assets.some(a => a.id === assetId)) throw new Error('Choose an existing campaign with saved brand, direction and asset prompt.');
  process.env.MAX_REFINEMENTS = '0'; // One image only; no additional LLM calls.
  await runCampaign(campaignId, e => console.log(`${e.stage}: ${e.status} — ${e.message}`), { assetId });
  const after = await getCampaign(campaignId);
  const generation = after!.assets.find(a => a.id === assetId)!.generations.at(-1)!;
  console.log(JSON.stringify({ campaignId, assetId, version: generation.version, provider: generation.provider, imageUrl: generation.imageUrl }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Live verification failed.'); process.exitCode = 1; }).finally(() => db.$disconnect());
