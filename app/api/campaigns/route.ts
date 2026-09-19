import { db } from '@/lib/database/client';
import { createCampaign } from '@/lib/database/campaigns';
import { briefSchema } from '@/types/campaign';
import { apiError, checkOrigin } from '@/lib/api';
export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await db.campaign.findMany({ orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, brandName: true, status: true, updatedAt: true, _count: { select: { assets: true } } } })); }
  catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try { checkOrigin(request); const c = await createCampaign(briefSchema.parse(await request.json())); return Response.json({ id: c.id }, { status: 201 }); }
  catch (e) { return apiError(e); }
}
