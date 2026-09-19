import {z} from 'zod';
import {checkOrigin} from '@/lib/api';
import {retryJob} from '@/lib/jobs/store';
import {jobApiError,jobBody} from '@/lib/jobs/api';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(request);const body=z.object({attempt:z.number().int().min(1)}).parse(await jobBody(request));return Response.json(await retryJob((await params).id,body.attempt),{status:202});}catch(e){return jobApiError(e);}}
