import { db } from '@/lib/database/client';
import { storage } from '@/lib/storage';
import { apiError } from '@/lib/api';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const file = await db.upload.findUnique({ where: { id: (await params).id } });
    if (!file) return Response.json({ error: 'File not found.' }, { status: 404 });
    return new Response(new Uint8Array(await storage.get(file.id)), { headers: {
      'Content-Type': file.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`
    } });
  } catch (e) { return apiError(e); }
}
