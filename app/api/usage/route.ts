import {z} from 'zod';
import {usageReport,exportUsage} from '@/lib/usage/report';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional();
const query=z.object({campaignId:id,jobId:id,assetId:id,generationId:id,attempt:z.coerce.number().int().positive().optional(),export:z.enum(['json']).optional()}).strict();
export async function GET(request:Request){
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success||parsed.data.attempt&&!parsed.data.jobId)return Response.json({error:'Invalid usage filter.'},{status:400});
 const {export:format,...filter}=parsed.data;
 try{
  if(format)return new Response(await exportUsage(filter),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="creativeflow-usage.json"','Cache-Control':'no-store'}});
  return Response.json(await usageReport(filter),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Usage records are unavailable. Check the database setup.'},{status:500});}
}
