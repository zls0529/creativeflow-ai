import 'server-only';
import {runCampaign} from '@/lib/agents/orchestrator';
import {getLLMProvider,getImageProvider,type Providers} from '@/lib/providers';
import {getCampaign} from '@/lib/database/campaigns';
import {executionContext,executionCheckpoint} from '@/lib/jobs/context';
import {executeCommercialPoster} from '@/lib/commercial-poster/execute';
import {executeProductHero} from '@/lib/product-hero/execute';
import {commercialPosterInputSchema} from '@/types/commercial-poster';
import {productHeroInputSchema} from '@/types/product-hero';
import type {JobInput} from '@/types/jobs';
export async function executeRouted(input:JobInput,progress:(stage:string,message:string)=>Promise<void>,override?:Providers){
 const context=executionContext.getStore();if(!context||!input.routing?.length)throw new Error('Frozen job routing required.');context.routing=input.routing;
 if(input.routing.some(r=>r.blockers.length))throw new Error('Frozen route is unavailable. Fix inputs and create a new job.');
 const special=input.routing.some(r=>['commercial_poster_v1','product_hero_v1'].includes(r.providerMode));
 const emit=async(e:{stage:string;message:string})=>progress(e.stage,e.message);
 if(!special){await runCampaign(input.campaignId,emit,input.assetId?{assetId:input.assetId,instruction:input.instruction}:undefined,override,input.conditioningStrength);return;}
 if(input.instruction)throw new Error('This workflow does not support the legacy prompt refinement loop.');
 let c=(await getCampaign(input.campaignId))!;
 if(!c.brandProfile||!c.direction||input.routing.some(r=>!c.assets.some(a=>a.kind===r.placement))){await runCampaign(c.id,emit,undefined,override??{llm:getLLMProvider(),image:getImageProvider(),vision:{name:'not_required',evaluate:async()=>{throw new Error('Strategy preparation must not call Vision.');}}},undefined,true);c=(await getCampaign(c.id))!;}
 for(const route of input.routing){await executionCheckpoint();const asset=c.assets.find(a=>a.kind===route.placement)!;if(!input.assetId&&['ready','approved','needs_review'].includes(asset.status))continue;
  if(route.providerMode==='commercial_poster_v1')await executeCommercialPoster(c.id,asset.id,input.commercialPoster??commercialPosterInputSchema.parse({sourceId:route.productSourceId}),progress,override);
  else if(route.providerMode==='product_hero_v1')await executeProductHero(c.id,asset.id,input.productHero??productHeroInputSchema.parse({sourceId:route.productSourceId,styleId:c.uploads.find(u=>route.referenceIds.includes(u.id)&&['style','reference'].includes(u.role))?.id}),progress,override);
 }
}
