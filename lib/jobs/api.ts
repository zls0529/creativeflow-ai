import 'server-only';
import {z} from 'zod';
import {JobConflictError,JobNotFoundError} from './errors';
export function jobApiError(error:unknown){
 const status=error instanceof JobNotFoundError?404:error instanceof JobConflictError?409:error instanceof z.ZodError?400:400;
 const message=error instanceof JobNotFoundError||error instanceof JobConflictError?error.message:error instanceof z.ZodError?'Invalid job request. Check campaign, asset and action fields.':'Job operation could not be completed. Refresh status before retrying.';
 return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
export async function jobBody(request:Request){const text=await request.text();if(text.length>12000)throw new Error('Request too large');return JSON.parse(text);}
