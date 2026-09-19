import 'server-only';
import type {CampaignView} from '@/types/campaign';
import type {CommercialPosterInput} from '@/types/commercial-poster';
import type {ReadinessReport,ReadinessItem} from '@/types/readiness';
import {commercialPosterRequest,commercialPosterPlan,kleinEnvironment,requireKleinDependencies} from './pipeline';
import {productTransport} from '@/lib/product-hero/transport';
import {safeReadinessText} from '@/lib/readiness';
export async function checkCommercialPosterReadiness(c:CampaignView|null|undefined,assetId:string|undefined,input:CommercialPosterInput,deps:{env?:Record<string,string|undefined>;fetch?:typeof fetch}={}):Promise<ReadinessReport>{
 const env=deps.env??process.env,items:ReadinessItem[]=[];
 try{if(!c)throw new Error('Campaign unavailable.');if(env.IMAGE_PROVIDER!=='comfyui')throw new Error('Commercial Poster requires IMAGE_PROVIDER=comfyui.');
  const {request}=commercialPosterRequest(c,assetId,input);await commercialPosterPlan(request);requireKleinDependencies(await productTransport(kleinEnvironment(env),deps.fetch,'Commercial Poster').catalog());
  items.push({id:'klein',name:'Klein workflow and reference',status:'ready',severity:'informational',explanation:'Pinned template, stored product, installed Klein diffusion model, Qwen encoder, VAE and required nodes are available.'});
 }catch(e){items.push({id:'klein',name:'Commercial Poster dependencies',status:'unavailable',severity:'blocking',explanation:safeReadinessText(e instanceof Error?e.message:'Unavailable.',env)});}
 items.push({id:'experimental',name:'Experimental · Hero only',status:'warning',severity:'warning',explanation:'880×592, 4 steps, batch 1. Product details may change. Uses saved strategy and approved rules; no new semantic brand check, paid Vision or automatic refinement. Other reference roles are not used by this explicit single-product workflow.'});
 return {checkedAt:new Date().toISOString(),canGenerate:!items.some(i=>i.severity==='blocking'),items,workflowModes:['commercial_poster_v1'],provisional:false};
}
