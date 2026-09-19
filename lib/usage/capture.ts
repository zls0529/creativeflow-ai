import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {db} from '@/lib/database/client';
import {executionContext} from '@/lib/jobs/context';
import {estimate,optionalRate,pricing,responseTokens,type Tokens} from './pricing';

type Scope={routing?:import('@/types/creative-mode').RoutingDecision;campaignId:string;assetId?:string;generationId?:string;refinementIndex?:number};
const scope=new AsyncLocalStorage<Scope>();
export function withUsageScope<T>(value:Partial<Scope>,work:()=>Promise<T>):Promise<T>{
 return scope.run({...scope.getStore(),...value} as Scope,work);
}
export const operationFor=(name:string)=>({brand_profile:'llm_brand_analysis',creative_direction:'llm_creative_direction',image_prompt:'llm_prompt_generation',refined_prompt:'llm_refinement',brand_material:'brand_intelligence_analysis',brand_conflicts:'brand_conflict_check',vision_critic:'vision_review'}[name]??'llm_other');
type Metadata={creativeMode?:string;workflowId?:string;workflow?:string;width?:number;height?:number;checkpoint?:string;detailPasses?:string[];plannedRefinementPasses?:number;completedRefinementPasses?:number;serviceTier?:string};
type Call={tokens:Tokens;model:string|null;metadata:Metadata;serviceTier?:string};
const callContext=new AsyncLocalStorage<Call>();
function safeLabel(value:string){
 let text=value.replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'[redacted]');
 for(const [key,secret] of Object.entries(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key)&&secret&&secret.length>=4)text=text.split(secret).join('[redacted]');
 return text.slice(0,1000);
}
// Only explicitly allowed counters/identifiers are retained; never response bodies or prompts.
export function captureResponse(value:unknown){
 const call=callContext.getStore();if(!call||!value||typeof value!=='object')return;
 const response=value as Record<string,unknown>;
 call.tokens=responseTokens(response.usage);
 if(typeof response.model==='string'&&/^[a-z0-9][a-z0-9._:-]{0,100}$/i.test(response.model)&&!response.model.startsWith('sk-'))call.model=response.model;
 if(typeof response.service_tier==='string'){
  call.serviceTier=response.service_tier;
  call.metadata.serviceTier=['default','auto','priority','flex','scale'].includes(response.service_tier)?response.service_tier:'unknown';
 }
}
export function captureLocal(metadata:Metadata){const call=callContext.getStore();if(call)Object.assign(call.metadata,{...metadata,...(metadata.checkpoint?{checkpoint:safeLabel(metadata.checkpoint)}:{}),...(metadata.detailPasses?{detailPasses:metadata.detailPasses.map(safeLabel)}:{})});}
export class UsageLimitError extends Error{constructor(message:string){super(message);this.name='UsageLimitError';}}
async function checkBudget(c:Scope,model:string){
 const job=executionContext.getStore();
 for(const [key,where] of [
  ['MAX_CAMPAIGN_API_COST_USD',{campaignId:c.campaignId}],
  ['MAX_JOB_API_COST_USD',job?{jobId:job.jobId}:null]
 ] as const){
  const limit=optionalRate(key);if(limit===null||!where)continue;
  if(!pricing(model))throw new UsageLimitError(`${key}: the next model has no pricing entry. Configure pricing before another paid call.`);
  const events=await db.usageEvent.findMany({where:{...where,provider:'openai'},select:{estimatedCostUsd:true}});
  if(events.some(e=>e.estimatedCostUsd===null))throw new UsageLimitError(`${key}: an earlier API call has unavailable cost. Review usage before continuing paid calls.`);
  if(events.reduce((n,e)=>n+(e.estimatedCostUsd??0),0)>=limit)throw new UsageLimitError(`${key}: estimated API cost limit reached. No further paid call was made.`);
 }
}
/** One durable row per call. Pending rows survive interruption and are never assumed free. */
export async function measure<T>(provider:'openai'|'comfyui'|'mock',category:'text'|'vision'|'image',operation:string,model:string|null,work:()=>Promise<T>):Promise<T>{
 const context=scope.getStore();
 // Standalone adapter/unit calls have no campaign to bill or persist against.
 if(!context?.campaignId)return work();
 if(provider==='openai')await checkBudget(context,model??'');
 const snapshot=provider==='openai'?pricing(model??''):null;
 const localRate=provider==='comfyui'?optionalRate('LOCAL_GPU_COST_PER_HOUR'):null;
 const execution=executionContext.getStore();
 const route=context.routing??execution?.routing?.find(r=>execution.routing?.length===1||r.selected.id===model);
 const call:Call={tokens:responseTokens(null),model,metadata:route?{creativeMode:route.creativeMode,workflowId:route.selected.id}:execution?.routing?.length?{creativeMode:execution.routing[0].creativeMode,workflowId:execution.routing[0].selected.id}:{}};
 const {routing:recordedRoute,...scopeFields}=context;void recordedRoute;
 const event=await db.usageEvent.create({data:{...scopeFields,jobId:execution?.jobId,attempt:execution?.attempt,provider,category,operation,model:model?safeLabel(model):null,pricingSnapshot:snapshot?JSON.stringify(snapshot):null}});
 const started=Date.now();let status='failed';
 try{return await callContext.run(call,async()=>{const result=await work();status='success';return result;});}
 finally{
  const durationMs=Math.min(2147483647,Math.max(0,Date.now()-started));
  const actualSnapshot=provider==='openai'?pricing(call.model??''):null;
  // Nonstandard service tiers require their own pricing; do not apply standard rates.
  const standard=!call.serviceTier||['default','auto'].includes(call.serviceTier);
  const cost=provider==='mock'?0:provider==='comfyui'?(localRate===null?null:durationMs/3600000*localRate):standard?estimate(call.tokens,actualSnapshot):null;
  await db.usageEvent.update({where:{id:event.id},data:{status,durationMs,...call.tokens,model:call.model?safeLabel(call.model):null,estimatedCostUsd:cost,pricingSnapshot:actualSnapshot?JSON.stringify(actualSnapshot):localRate!==null?JSON.stringify({currency:'USD',localPerHour:localRate,basis:'provider wall-clock duration'}):null,metadata:JSON.stringify(call.metadata)}});
 }
}
