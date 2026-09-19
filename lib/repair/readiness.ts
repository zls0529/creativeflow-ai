import 'server-only';
import type {CampaignView} from '@/types/campaign';
import type {RepairRequest} from '@/types/repair';
import type {ReadinessItem,ReadinessReport} from '@/types/readiness';
import {repairInput} from './input';
import {repairPlan,validateRepairNodes} from '@/lib/providers/image/repair';
import {openAIConfiguration} from '@/lib/providers/openai/responses';
import {safeReadinessText} from '@/lib/readiness';
export async function checkRepairReadiness(c:CampaignView|null|undefined,assetId:string|undefined,repair:RepairRequest,deps:{env?:Record<string,string|undefined>;fetch?:typeof fetch;timeoutMs?:number}={}):Promise<ReadinessReport>{
 const env=deps.env??process.env,items:ReadinessItem[]=[];
 const add=(id:string,status:ReadinessItem['status'],explanation:string)=>items.push({id,name:id,status,severity:status==='unavailable'?'blocking':status==='warning'?'warning':'informational',explanation:safeReadinessText(explanation,env)});
 add('Repair prompt','ready','Focused local instructions are composed without an additional LLM call.');
 try{if(!c)throw new Error('Repair campaign is unavailable.');if((env.IMAGE_PROVIDER||'mock')!=='comfyui')throw new Error('Selected image provider does not support local repair. Select ComfyUI; no mock/full-image fallback.');
 const {request}=repairInput(c,assetId,repair);const plan=await repairPlan(request,env);add('Source and mask','ready',repair.selection==='auto_face'?'Source PNG validated. Automatic detection will target all detected faces; a missing/empty mask fails explicitly.':'Source PNG and bounded manual mask validated.');
 const response=await (deps.fetch??fetch)(new URL(plan.config.url.pathname.replace(/\/$/,'')+'/object_info',plan.config.url),{signal:AbortSignal.timeout(deps.timeoutMs??5000),redirect:'error',cache:'no-store'});if(!response.ok)throw new Error('ComfyUI repair dependencies could not be reached.');const catalog=await response.json();validateRepairNodes(plan.graph,catalog);add('Repair workflow / nodes / checkpoint','ready','Selected repair template, installed node types and configured model/sampler choices validated.');
 }catch(e){add('Repair dependencies','unavailable',e instanceof Error?e.message:'Repair dependencies are unavailable.');}
 if((env.VISION_PROVIDER||'mock')==='openai'){try{openAIConfiguration('VISION_MODEL','gpt-4.1',env);add('Vision re-review','configured','Real Vision re-review will run once after repair. This check does not authenticate or make a paid request.');}catch(e){add('Vision re-review','unavailable',e instanceof Error?e.message:'Vision unavailable.');}}
 else if(!env.VISION_PROVIDER||env.VISION_PROVIDER==='mock')add('Vision re-review','warning','Mock Vision cannot establish repair quality. No simulated review will be treated as evidence; human review is required.');else add('Vision re-review','unavailable','Unsupported Vision provider.');
 if(c?.brandIntelligence?.approved?.rules.length&&(env.VISION_PROVIDER||'mock')!=='openai')add('Brand compliance','unavailable','Approved brand rules require real Vision compliance review.');
 if(c?.brandIntelligence?.approved?.rules.some(r=>r.origin==='source')){
  try{if(env.LLM_PROVIDER!=='openai')throw new Error('Approved source rules require a real LLM conflict check for the repair instruction.');openAIConfiguration('OPENAI_MODEL','gpt-4.1-mini',env);add('Brand conflict check','configured','Existing brand conflict check may make one LLM call, recorded in usage.');}catch(e){add('Brand conflict check','unavailable',e instanceof Error?e.message:'Brand conflict check unavailable.');}
 }
 if(c?.brandIntelligence?.conflicts.some(f=>f.status==='unresolved')||c?.brandIntelligence?.draft&&!c.brandIntelligence.approved)add('Brand rules','unavailable','Review and resolve Brand Intelligence before repair.');
 return {checkedAt:new Date().toISOString(),canGenerate:!items.some(i=>i.severity==='blocking'),provisional:false,workflowModes:[repair.selection==='auto_face'?'face_repair':'inpaint_repair'],items};
}
