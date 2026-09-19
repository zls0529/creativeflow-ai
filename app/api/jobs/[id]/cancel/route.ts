import {checkOrigin} from '@/lib/api';
import {cancelJob} from '@/lib/jobs/store';
import {jobApiError} from '@/lib/jobs/api';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(request);return Response.json(await cancelJob((await params).id));}catch(e){return jobApiError(e);}}
