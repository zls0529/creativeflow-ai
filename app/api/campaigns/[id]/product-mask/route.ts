import {db} from '@/lib/database/client';
import {apiError,checkOrigin} from '@/lib/api';
import {acceptManualMask} from '@/lib/product-hero/segmentation';
import {SegmentationError} from '@/lib/product-hero/segmentation-store';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);if(Number(request.headers.get('content-length')||0)>11*1024*1024)return Response.json({error:'Mask upload limit is 10 MB.'},{status:413});
  const campaignId=(await params).id,form=await request.formData(),sourceId=form.get('sourceId'),file=form.get('mask');
  if(typeof sourceId!=='string'||!(file instanceof File)||!file.size||file.size>10*1024*1024)return Response.json({error:'Choose one PNG mask under 10 MB.'},{status:400});
  if(!await db.upload.findFirst({where:{id:sourceId,campaignId,role:'product'}}))return Response.json({error:'Product reference does not belong to this campaign.'},{status:400});
  return Response.json(await acceptManualMask(sourceId,Buffer.from(await file.arrayBuffer())));
 }catch(e){if(e instanceof SegmentationError)return Response.json({error:e.message,report:e.report},{status:422});return apiError(e);}
}
