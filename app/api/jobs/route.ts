import {checkOrigin} from '@/lib/api';
import {createJob,listJobs,recoverStaleJobs} from '@/lib/jobs/store';
import {jobApiError,jobBody} from '@/lib/jobs/api';
export const runtime='nodejs';
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await createJob(await jobBody(request)),{status:202});}catch(e){return jobApiError(e);}}
export async function GET(request:Request){try{checkOrigin(request);const campaignId=new URL(request.url).searchParams.get('campaignId');if(!campaignId)throw new Error();await recoverStaleJobs();return Response.json(await listJobs(campaignId),{headers:{'Cache-Control':'no-store'}});}catch(e){return jobApiError(e);}}
