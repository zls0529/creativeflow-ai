import {checkOrigin} from '@/lib/api';
import {getJob,recoverStaleJobs} from '@/lib/jobs/store';
import {jobApiError} from '@/lib/jobs/api';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(request);await recoverStaleJobs();return Response.json(await getJob((await params).id),{headers:{'Cache-Control':'no-store'}});}catch(e){return jobApiError(e);}}
