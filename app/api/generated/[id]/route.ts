import { storage } from '@/lib/storage';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bytes = await storage.getGenerated(id);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable' } });
  } catch { return Response.json({ error: 'Generated image not found.' }, { status: 404 }); }
}
