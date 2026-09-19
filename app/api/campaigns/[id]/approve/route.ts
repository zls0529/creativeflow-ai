import { db } from '@/lib/database/client';
import { withCampaignLock } from '@/lib/agents/orchestrator';
import { apiError, checkOrigin } from '@/lib/api';
import { z } from 'zod';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { assetId, generationId } = z.object({ assetId: z.string(), generationId: z.string() }).parse(await request.json());
    const campaignId = (await params).id;
    return await withCampaignLock(campaignId, async () => {
      const asset = await db.campaignAsset.findFirst({ where: { id: assetId, campaignId }, include: { generations: { orderBy: { version: 'desc' }, take: 1, include: { evaluation: true } } } });
      if (!asset) return Response.json({ error: 'Asset not found.' }, { status: 404 });
      if (asset.generations[0]?.id !== generationId) return Response.json({ error: 'A newer version exists. Refresh and review it before approving.' }, { status: 409 });
      if (!asset.generations[0]?.evaluation || !['ready', 'needs_review', 'approved'].includes(asset.status)) return Response.json({ error: 'Finish generation and review before approving.' }, { status: 400 });
      await db.$transaction([
        db.campaignAsset.update({ where: { id: assetId }, data: { status: 'approved' } }),
        db.generation.update({ where: { id: asset.generations[0].id }, data: { status: 'approved' } })
      ]);
      return Response.json({ ok: true });
    });
  } catch (e) { return apiError(e); }
}
