import {withUsageScope} from '@/lib/usage/capture';
import {requireReadiness} from '@/lib/readiness';
import {z} from 'zod';
import {checkOrigin} from '@/lib/api';
import {withCampaignLock} from '@/lib/agents/orchestrator';
import {getCampaign} from '@/lib/database/campaigns';
import {getLLMProvider,getVisionProvider} from '@/lib/providers';
import {readIntelligence,saveIntelligence} from '@/lib/brand/store';
import {analyseBrandFiles,approveRules,editSchema,resolveBrandConflict,checkBrandBrief} from '@/lib/brand/service';
import {reviewText} from '@/lib/review-comparison';
import {saveEvaluation} from '@/lib/database/evaluations';
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('analyse'),sourceIds:z.array(z.string()).min(1).max(8).optional()}),z.object({action:z.literal('approve'),rules:z.array(editSchema).max(100)}),
 z.object({action:z.literal('resolve'),id:z.string(),status:z.enum(['user_override','guideline_enforced'])}),
 z.object({action:z.literal('check')}),z.object({action:z.literal('evaluate'),generationId:z.string()})
]);
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);if(Number(request.headers.get('content-length')||0)>200000)return Response.json({error:'Brand request is too large.'},{status:413});
  const id=(await params).id,action=actionSchema.parse(await request.json());
  const c=await getCampaign(id);if(!c)return Response.json({error:'Campaign not found.'},{status:404});
  await withCampaignLock(id,async()=>{
   if(action.action==='analyse'){await requireReadiness({campaign:c,purpose:'brand_analysis'});await analyseBrandFiles(id,getLLMProvider(),action.sourceIds);}
   if(action.action==='approve'){const {intelligence}=await readIntelligence(id);await saveIntelligence(id,approveRules(intelligence,action.rules));}
   if(action.action==='resolve')await resolveBrandConflict(id,action.id,action.status);
   if(action.action==='check')await checkBrandBrief(id,getLLMProvider());
   if(action.action==='evaluate'){
    const current=(await getCampaign(id))!,constraints=current.brandIntelligence?.approved;
    const asset=current.assets.find(a=>a.generations.some(g=>g.id===action.generationId)),g=asset?.generations.find(g=>g.id===action.generationId);
    if(!constraints||!current.brandProfile||!current.direction||!asset||!g?.imageUrl)throw new Error('An existing generated image, brand strategy and approved rules are required.');
    const vision=getVisionProvider();if(vision.name==='mock')throw new Error('Brand-compliance review requires real Vision; mock cannot assess pixels.');
    const evaluation=await withUsageScope({assetId:asset.id,generationId:g.id},()=>vision.evaluate({brandConstraints:constraints,imageUrl:g.imageUrl,prompt:g.prompt,brand:current.brandProfile!,direction:current.direction!,placement:asset.kind,objective:current.objective,version:g.version,iteration:0}));
    await saveEvaluation(g.id,vision.name,evaluation);
   }
  });
  return Response.json(await getCampaign(id));
 }catch(e){return Response.json({error:e instanceof z.ZodError?'Invalid brand request or incomplete structured analysis. No invalid data was saved.':reviewText(e instanceof Error?e.message:'Brand analysis failed. Please retry.')},{status:400});}
}
