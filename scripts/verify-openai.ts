/** Manual opt-in only. NOT imported by automated tests. Runs one paid campaign, with no retries. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../lib/database/client';
import { createCampaign, getCampaign } from '../lib/database/campaigns';
import { runCampaign } from '../lib/agents/orchestrator';
import { getProviders } from '../lib/providers';
import { OpenAIProviderError } from '../lib/providers/llm/openai';
import { analyseBrand, directCampaign, engineerPrompt } from '../lib/agents/creative';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { assetSpecs, type Brief } from '../types/campaign';

const reportPath = 'storage/openai-verification.json';
const brief: Brief = {
  name: 'Tidal Field — OpenAI verification', brandName: 'Tidal Field Ceramics',
  objective: 'Launch a small collection of handmade, repairable ceramic tea mugs.',
  audience: 'Design-conscious apartment dwellers who value quiet evening tea rituals',
  brief: 'Show a handmade ceramic tea mug with a distinct thumb indentation and sea-glass glaze. Use folded linen and wet slate as supporting textures. Emphasize visible handcraft and an evening wind-down ritual. No coffee, bottles, city commuting or morning energy claims.',
  style: 'Tactile, intimate editorial still-life', colours: ['#305E63', '#D9DED0', '#7B6A58']
};

async function main() {
  if (!process.argv.includes('--live')) throw new Error('Manual verification requires --live and may incur API charges.');
  if (existsSync(reportPath)) throw new Error('A live verification record already exists. Inspect it instead of repeating paid requests.');
  const providers = getProviders();
  if (providers.llm.name !== 'openai' || providers.image.name !== 'mock' || providers.vision.name !== 'mock') {
    throw new Error('Verification requires LLM_PROVIDER=openai, IMAGE_PROVIDER=mock and VISION_PROVIDER=mock.');
  }
  const campaign = await createCampaign(brief);
  const originalFetch = globalThis.fetch;
  const calls: { status: number; agent: string }[] = [];
  let attempts = 0;
  globalThis.fetch = async (input, init) => {
    attempts++;
    const agent = JSON.parse(String(init?.body)).text.format.name as string;
    const response = await originalFetch(input, init);
    calls.push({ status: response.status, agent });
    return response;
  };
  await mkdir('storage', { recursive: true });
  const base = { campaignId: campaign.id, campaignName: brief.name, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', startedAt: new Date().toISOString() };
  await writeFile(reportPath, JSON.stringify({ ...base, status: 'started' }, null, 2));
  try {
    await runCampaign(campaign.id, event => {
      if (event.status === 'completed') console.log(`Completed: ${event.stage}`);
    });
    const result = (await getCampaign(campaign.id))!;
    const mock = new MockLLMProvider();
    const mockBrand = await analyseBrand(mock, brief, []);
    const mockDirection = await directCampaign(mock, brief, result.brandProfile!);
    const mockPrompt = await engineerPrompt(mock, result.brandProfile!, result.direction!, assetSpecs[0]);
    const checks = {
      completed: result.status === 'completed',
      briefSpecificProduct: /ceramic|tea mug|handmade/i.test(result.brandProfile!.product),
      brandDiffersFromMock: JSON.stringify(result.brandProfile) !== JSON.stringify(mockBrand),
      directionDiffersFromMock: JSON.stringify(result.direction) !== JSON.stringify(mockDirection),
      promptDiffersFromMock: JSON.stringify(result.assets[0].generations[0].prompt) !== JSON.stringify(mockPrompt),
      fivePlacements: result.assets.length === 5,
      distinctCompositions: new Set(result.assets.map(a => a.generations[0].prompt.composition)).size === 5,
      refinementUsedOpenAI: calls.some(c => c.agent === 'refined_prompt' && c.status === 200),
      imagesRemainMock: result.assets.every(a => a.generations.every(g => g.provider === 'mock'))
    };
    const report = { ...base, status: 'completed', completedAt: new Date().toISOString(), attempts, calls, checks,
      product: result.brandProfile!.product, concept: result.direction!.concept,
      placements: result.assets.map(a => ({ kind: a.kind, versions: a.generations.length })) };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (Object.values(checks).some(value => !value)) process.exitCode = 1;
  } catch (error) {
    const safeMessage = error instanceof OpenAIProviderError ? error.message : 'Live verification failed outside the OpenAI adapter; inspect local campaign state.';
    await writeFile(reportPath, JSON.stringify({ ...base, status: 'failed', attempts, calls, error: safeMessage }, null, 2));
    console.error(safeMessage);
    process.exitCode = 1;
  } finally { globalThis.fetch = originalFetch; }
}

main().catch(error => {
  // Preflight errors contain only locally authored messages; never print environment variables or request options.
  console.error(error instanceof OpenAIProviderError ? error.message : 'Live verification preflight failed. Check provider settings, --live, and whether storage/openai-verification.json already exists.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
