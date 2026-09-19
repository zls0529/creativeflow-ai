import { db } from '../lib/database/client';
import { createCampaign } from '../lib/database/campaigns';
import { demoBrief } from '../lib/demo';
import { runCampaign } from '../lib/agents/orchestrator';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { MockImageProvider } from '../lib/providers/image/mock';
import { MockVisionProvider } from '../lib/providers/vision/mock';
async function main() {
  const existing = await db.campaign.findFirst({ where: { name: demoBrief.name, brandName: demoBrief.brandName } });
  if (existing?.status === 'completed') return;
  const campaign = existing ?? await createCampaign(demoBrief);
  await runCampaign(campaign.id, () => {}, undefined, { llm: new MockLLMProvider(), image: new MockImageProvider(), vision: new MockVisionProvider() });
  console.log('Seeded Quiet Energy with 5 assets and version histories.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
