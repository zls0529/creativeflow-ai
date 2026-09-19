import 'server-only';
import type {CampaignView} from '@/types/campaign';
import type {ProductHeroInput} from '@/types/product-hero';
import type {ReadinessItem,ReadinessReport} from '@/types/readiness';
import {productHeroRequest,productHeroPlan} from './pipeline';
import {productTransport} from './transport';
import {validateRepairNodes} from '@/lib/providers/image/repair';
import {openAIConfiguration} from '@/lib/providers/openai/responses';
import {safeReadinessText} from '@/lib/readiness';
import {extractionReadiness} from './segmentation';
export async function checkProductHeroReadiness(c:CampaignView|null|undefined,assetId:string|undefined,input:ProductHeroInput,deps:{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}):Promise<ReadinessReport>{
 const env=deps.env??process.env,items:ReadinessItem[]=[];
 const add=(name:string,status:ReadinessItem['status'],explanation:string)=>items.push({id:name,name,status,severity:status==='unavailable'?'blocking':status==='warning'?'warning':'informational',explanation:safeReadinessText(explanation,env)});
 try{
  if(!c)throw new Error('Campaign is unavailable.');if(env.IMAGE_PROVIDER!=='comfyui')throw new Error('Product Hero requires ComfyUI; mock generation is not a preservation workflow.');
  const {request}=productHeroRequest(c,assetId,input),plan=await productHeroPlan(request,env),catalog=await productTransport(env,deps.fetch).catalog();
  validateRepairNodes(plan.graph,catalog);const segmentationStatus=await extractionReadiness(plan,env,catalog);
  add('Product reference / compositor','ready','Stored product and image decoder validated. Original RGB is used for compositing; the model supplies only a mask.');
  add('Segmentation','ready',segmentationStatus);
  add('Mask review','warning','Manual mask may be required. Coverage and component checks cannot establish semantic completeness; inspect the extracted product.');
  add('Background','ready','Pinned background template and configured checkpoint validated. Style conditioning is applied only to the background when selected.');
  add('Integration','ready','Procedural shadow, one-pixel inward feather and bounded edge-only luminance matching. No relighting model or repair required.');
 }catch(e){add('Product Hero dependencies','unavailable',e instanceof Error?e.message:'Dependencies unavailable.');}
 try{if(env.VISION_PROVIDER!=='openai')throw new Error('Product Hero requires real Vision with source and output images; mock review cannot establish fidelity.');const config=openAIConfiguration('VISION_MODEL','gpt-4.1',env);if(/^(text-|gpt-3|whisper|tts-|dall-e|o1-mini|o1-preview)/.test(config.model))throw new Error('Product Hero requires an image-capable structured-output Vision model.');add('Reference-aware Vision','configured','One review sends source and output to OpenAI after generation; this preflight makes no paid call.');}catch(e){add('Reference-aware Vision','unavailable',e instanceof Error?e.message:'Vision unavailable.');}
 if(c?.brandIntelligence?.draft&&!c.brandIntelligence.approved||c?.brandIntelligence?.conflicts.some(f=>f.status==='unresolved'))add('Brand rules','unavailable','Approve brand rules and resolve conflicts first.');
 if(c?.brandIntelligence?.approved?.rules.some(r=>r.origin==='source')){try{if(env.LLM_PROVIDER!=='openai')throw new Error('Source brand rules require the real LLM conflict checker.');openAIConfiguration('OPENAI_MODEL','gpt-4.1-mini',env);}catch(e){add('Brand conflict check','unavailable',e instanceof Error?e.message:'LLM unavailable.');}}
 add('Experimental preservation','warning','SAM can miss parts. Only transformed opaque core equality is checked deterministically. Human review of the source, mask, seams and product identity remains required.');
 return {checkedAt:new Date().toISOString(),canGenerate:!items.some(i=>i.severity==='blocking'),items,workflowModes:['product_hero_v1'],provisional:false};
}
