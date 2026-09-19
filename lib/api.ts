import { ZodError } from 'zod';
import { BusyError } from './agents/orchestrator';
export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  if (error instanceof BusyError) return Response.json({ error: error.message }, { status: 409 });
  console.error(error);
  return Response.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 500 });
}
/** Reject cross-origin writes for this unauthenticated, localhost-only MVP. */
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next's internal request URL may use localhost while the browser uses 127.0.0.1.
  const host = request.headers.get('host') || new URL(request.url).host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new Error('This MVP only accepts localhost requests.');
  if (origin && new URL(origin).host !== host) throw new Error('Cross-origin writes are not allowed.');
}
