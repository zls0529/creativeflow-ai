import 'server-only';
import {checkReadiness,readinessRequests,type ReadinessOptions} from '@/lib/readiness';
import {checkCommercialPosterReadiness} from '@/lib/commercial-poster/readiness';
import {checkProductHeroReadiness} from '@/lib/product-hero/readiness';
import {commercialPosterInputSchema} from '@/types/commercial-poster';
import {productHeroInputSchema} from '@/types/product-hero';
import type {ReadinessReport,ReadinessItem} from '@/types/readiness';
import {freezeRouting} from './routing';
export async function checkRoutingReadiness(options:ReadinessOptions,deps:Parameters<typeof checkReadiness>[1]={}):Promise<ReadinessReport>{
 const c=options.campaign;if(!c)throw new Error('Campaign required.');
 const routes=options.routing??freezeRouting(c,{assetId:options.assetId,workflowOverride:options.workflowOverride,commercialPoster:options.commercialPoster,productHero:options.productHero})??[];
 const items:ReadinessItem[]=[];const requests=readinessRequests({...options,assetId:undefined}).requests;
 for(const route of routes){
  if(route.referenceIds.some(id=>!c.uploads.some(u=>u.id===id))){items.push({id:'references-'+route.placement,name:'Frozen references',status:'unavailable',severity:'blocking',explanation:'A reference recorded when the job was created is no longer available. Start a new job after checking the inputs.'});continue;}

  items.push({id:'route-'+route.placement,name:route.placement+' · '+route.selected.id,status:route.blockers.length?'unavailable':'configured',severity:route.blockers.length?'blocking':'informational',explanation:route.reason+' Status: '+route.maturity+'. '+route.blockers.join(' '),remediation:route.fallbackRecommendation??undefined});
  for(const warning of route.warnings)items.push({id:'warning-'+items.length,name:'Workflow limitations',status:'warning',severity:'warning',explanation:warning});
  if(route.blockers.length)continue;
  const spec=requests.find(r=>r.kind===route.placement);if(!spec){items.push({id:'missing-'+route.placement,name:'Placement',status:'unavailable',severity:'blocking',explanation:'No supported placement request.'});continue;}
  const source=c.assets.find(a=>a.kind===route.placement),preview={...c,brandProfile:c.brandProfile??spec.brand,direction:c.direction??spec.direction,uploads:c.uploads.filter(u=>route.referenceIds.includes(u.id)),assets:[{id:source?.id??'preflight-'+route.placement,kind:route.placement,name:route.placement,width:spec.width,height:spec.height,status:'pending',prompt:source?.prompt??spec.prompt,generations:source?.generations??[]}]};
  let report:ReadinessReport;
  if(route.providerMode==='commercial_poster_v1')report=await checkCommercialPosterReadiness(preview,preview.assets[0].id,options.commercialPoster??commercialPosterInputSchema.parse({sourceId:route.productSourceId}),deps);
  else if(route.providerMode==='product_hero_v1')report=await checkProductHeroReadiness(preview,preview.assets[0].id,options.productHero??productHeroInputSchema.parse({sourceId:route.productSourceId,styleId:c.uploads.find(u=>route.referenceIds.includes(u.id)&&['style','reference'].includes(u.role))?.id}),deps);
  else report=await checkReadiness({...options,campaign:preview,skipRouting:true,requests:[{...spec,references:preview.uploads,forcedWorkflow:route.providerMode}]},deps);
  items.push(...report.items.filter(i=>i.status!=='not_required').map(i=>({...i,id:route.placement+'-'+i.id})));
 }
 if(!c.brandProfile||!c.direction||routes.some(r=>!c.assets.some(a=>a.kind===r.placement))){const text=await checkReadiness({campaign:c,purpose:'brand_analysis',skipRouting:true},deps);items.push(...text.items.filter(i=>i.id==='LLM'));}
 return {checkedAt:new Date().toISOString(),canGenerate:routes.length>0&&!items.some(i=>i.severity==='blocking'),items,workflowModes:routes.map(r=>r.selected.id),provisional:!c.brandProfile||!c.direction||routes.some(r=>!c.assets.some(a=>a.kind===r.placement))};
}
