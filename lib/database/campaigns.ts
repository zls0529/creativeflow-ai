import {creativeSelectionSchema} from '@/types/creative-mode';
import { generationContextSchema } from '@/types/refinement';
import {brandIntelligenceSchema,emptyIntelligence} from '@/types/brand-intelligence';
import { db } from './client';
import type { AssetKind, Brief, CampaignView } from '@/types/campaign';
import { brandSchema, directionSchema, promptSchema, evaluationSchema } from '@/types/campaign';

export async function createCampaign(brief: Brief) {
  const {creative,...fields}=brief;return db.campaign.create({ data: { ...fields,creativeConfig:creative?JSON.stringify(creative):null, colours: JSON.stringify(brief.colours) } });
}
export async function getCampaign(id: string): Promise<CampaignView | null> {
  const expired = await db.campaign.updateMany({
    where: { id, activeJobId:null,status: 'running', lockAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
    data: { status: 'failed', lockAt: null, error: 'The previous workflow was interrupted. Retry to continue from saved work.' }
  });
  if (expired.count) {
    await db.agentRun.updateMany({ where: { campaignId: id, status: 'running' }, data: { status: 'failed', message: 'Workflow lease expired; retry is available.' } });
    await db.campaignAsset.updateMany({ where: { campaignId: id, status: 'generating' }, data: { status: 'failed' } });
  }
  const c = await db.campaign.findUnique({ where: { id }, include: {
    brandProfile: true, direction: true, uploads: true, runs: { orderBy: { createdAt: 'asc' } },
    assets: { orderBy: { createdAt: 'asc' }, include: { generations: { orderBy: { version: 'asc' }, include: { evaluation: true } } } }
  } });
  if (!c) return null;
  return { ...c,creative:c.creativeConfig?creativeSelectionSchema.parse(JSON.parse(c.creativeConfig)):undefined, colours: JSON.parse(c.colours), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    brandProfile: c.brandProfile ? brandSchema.safeParse(JSON.parse(c.brandProfile.data)).data ?? null : null,
    brandIntelligence: c.brandProfile && JSON.parse(c.brandProfile.data)._intelligence ? brandIntelligenceSchema.parse(JSON.parse(c.brandProfile.data)._intelligence) : emptyIntelligence(),
    constraintsRevision: c.brandProfile ? JSON.parse(c.brandProfile.data)._constraintsRevision : undefined,
    direction: c.direction ? directionSchema.parse(JSON.parse(c.direction.data)) : null,
    runs: c.runs.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    assets: c.assets.map(a => ({ ...a, kind: a.kind as AssetKind, prompt: promptSchema.parse(JSON.parse(a.prompt)),
      generations: a.generations.map(g => ({ ...g, context: JSON.parse(g.prompt)._generation ? generationContextSchema.parse(JSON.parse(g.prompt)._generation) : undefined, prompt: promptSchema.parse(JSON.parse(g.prompt)), createdAt: g.createdAt.toISOString(),
        evaluation: g.evaluation ? evaluationSchema.parse({ ...JSON.parse(g.evaluation.data), provider: g.evaluation.provider }) : null })) }))
  };
}
