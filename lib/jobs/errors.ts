import 'server-only';
import {safeReadinessText} from '@/lib/readiness';
export class JobConflictError extends Error {}
export class JobNotFoundError extends Error {}
export function safeJobMessage(error:unknown){return safeReadinessText(error instanceof Error?error.message:typeof error==='string'?error:'Execution failed. Check provider readiness and retry.',process.env).replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,1000);}
