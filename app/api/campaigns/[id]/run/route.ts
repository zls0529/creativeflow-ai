import {randomUUID} from 'node:crypto';
import {checkOrigin} from '@/lib/api';
import {createJob} from '@/lib/jobs/store';
import {jobApiError,jobBody} from '@/lib/jobs/api';
export const runtime='nodejs';
/** Compatibility entry point: enqueue, never execute in the HTTP request. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{checkOrigin(request);const body=await jobBody(request);return Response.json(await createJob({...body,campaignId:(await params).id,requestKey:body.requestKey??randomUUID()}),{status:202});}catch(e){return jobApiError(e);}
}
