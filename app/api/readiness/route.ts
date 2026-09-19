import {workflowOverrideSchema} from '@/types/creative-mode';
import {commercialPosterInputSchema} from '@/types/commercial-poster';
import {productHeroInputSchema} from '@/types/product-hero';
import {repairRequestSchema} from '@/types/repair';
import {z} from 'zod';
import {checkOrigin} from '@/lib/api';
import {getCampaign} from '@/lib/database/campaigns';
import {checkReadiness} from '@/lib/readiness';
import {conditioningStrengthSchema} from '@/types/reference';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  checkOrigin(request);
  const body=z.object({workflowOverride:workflowOverrideSchema.nullable().optional(),commercialPoster:commercialPosterInputSchema.optional(),productHero:productHeroInputSchema.optional(),repair:repairRequestSchema.optional(),campaignId:z.string().optional(),assetId:z.string().optional(),refine:z.boolean().optional(),purpose:z.enum(['generation','brand_analysis']).optional(),conditioningStrength:conditioningStrengthSchema.optional()}).parse(await request.json());
  const campaign=body.campaignId?await getCampaign(body.campaignId):null;
  if(body.campaignId&&!campaign)return Response.json({error:'Campaign not found.'},{status:404});
  return Response.json(await checkReadiness({...body,campaign}),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Readiness could not be checked. Refresh and retry; no generation was started.'},{status:400});}
}
