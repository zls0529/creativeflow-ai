import { getCampaign } from '@/lib/database/campaigns';
import { apiError } from '@/lib/api';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await getCampaign((await params).id); return c ? Response.json(c) : Response.json({ error: 'Campaign not found.' }, { status: 404 }); }
  catch (e) { return apiError(e); }
}
