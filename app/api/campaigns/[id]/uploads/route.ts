import {validateReferenceImage} from '@/lib/providers/image/references';
import { validatePoseImage } from '@/lib/providers/image/pose';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/database/client';
import { storage, detectMime } from '@/lib/storage';
import { withCampaignLock } from '@/lib/agents/orchestrator';
import { apiError, checkOrigin } from '@/lib/api';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 22 * 1024 * 1024) return Response.json({ error: 'Upload limit is 20 MB per request.' }, { status: 413 });
    const campaignId = (await params).id;
    if (!await db.campaign.findUnique({ where: { id: campaignId } })) return Response.json({ error: 'Campaign not found.' }, { status: 404 });
    const form = await request.formData();
    const roles = ['logo', 'product', 'reference', 'guidelines', 'pose', 'style'];
    const files = [...form.entries()];
    if (!files.length || files.length > 8) return Response.json({ error: 'Choose between 1 and 8 files.' }, { status: 400 });
    let total = 0;
    const validated: { id: string; role: string; name: string; size: number; mime: string; bytes: Buffer }[] = [];
    for (const [role, file] of files) {
      if (!roles.includes(role) || !(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return Response.json({ error: 'Each file must be a PNG, JPEG, WebP or PDF under 5 MB with a valid role.' }, { status: 400 });
      total += file.size;
      const bytes = Buffer.from(await file.arrayBuffer()), mime = detectMime(bytes);
      if (!mime || (mime === 'application/pdf' && role !== 'guidelines')) return Response.json({ error: 'PDF files are only accepted as brand guidelines. Use PNG, JPEG or WebP for images.' }, { status: 400 });
      if (['product','style','reference'].includes(role)) await validateReferenceImage(bytes);
      if (role === 'pose') await validatePoseImage(bytes);
      validated.push({ id: randomUUID(), role, name: file.name.split(/[\\/]/).at(-1)!.slice(0, 200), size: file.size, mime, bytes });
    }
    if (total > 20 * 1024 * 1024) return Response.json({ error: 'Total upload limit is 20 MB.' }, { status: 413 });
    return await withCampaignLock(campaignId, async () => {
      for(const roles of [['product'],['style','reference']]) if(validated.filter(f=>roles.includes(f.role)).length + await db.upload.count({where:{campaignId,role:{in:roles}}})>1) return Response.json({error:'Use one product image and one style reference per campaign.'},{status:400});
      if (validated.filter(f=>f.role === 'pose').length + await db.upload.count({where:{campaignId,role:'pose'}}) > 1) return Response.json({error:'Only one pose reference is allowed per campaign.'},{status:400});
      if (await db.upload.count({ where: { campaignId } }) + validated.length > 8) return Response.json({ error: 'Maximum 8 reference files per campaign.' }, { status: 400 });
      try {
        for (const file of validated) await storage.put(file.id, file.bytes);
        await db.$transaction(validated.map(file => db.upload.create({ data: { id: file.id, role: file.role, name: file.name, size: file.size, mime: file.mime, campaignId } })));
      } catch (e) { for (const file of validated) await storage.remove(file.id); throw e; }
      return Response.json({ ok: true });
    });
  } catch (e) { return apiError(e); }
}
