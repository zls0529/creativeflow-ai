import {z} from 'zod';
import {checkOrigin,apiError} from '@/lib/api';
import {reviewPoster} from '@/lib/commercial-poster/review';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{checkOrigin(request);const body=z.object({generationId:z.string().min(1),confirmPaidReview:z.literal(true)}).strict().parse(await request.json());return Response.json(await reviewPoster((await params).id,body.generationId));}catch(e){return apiError(e);}
}
