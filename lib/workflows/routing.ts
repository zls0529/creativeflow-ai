import 'server-only';
import {creativeSelectionSchema,type CreativeSelection,type RoutingDecision} from '@/types/creative-mode';
import {routeCreative} from './creative-modes';
import type {JobInput} from '@/types/jobs';
import {assetSpecs,type AssetKind} from '@/types/campaign';
export function freezeRouting(c:{creative?:CreativeSelection;uploads:{id:string;role:string}[];assets:{id:string;kind:string;status:string}[]},input:Pick<JobInput,'assetId'|'workflowOverride'|'commercialPoster'|'productHero'|'repair'>):RoutingDecision[]|undefined{
 if(input.repair)return undefined;
 const special=input.commercialPoster?'commercial_poster_v1':input.productHero?'product_hero_v1':undefined;
 const selection:CreativeSelection|undefined=c.creative??(special?{mode:special==='commercial_poster_v1'?'commercial_poster':'product_hero'}:input.workflowOverride?{mode:'custom',override:input.workflowOverride}:undefined);
 if(!selection)return undefined;
 const chosen=creativeSelectionSchema.parse({...selection,...(input.workflowOverride!==undefined?{override:input.workflowOverride??undefined}:special&&c.creative?{override:{workflowId:special,version:'1.0.0',reason:'Explicit asset workflow tool'}}:{})});
 const asset=input.assetId?c.assets.find(a=>a.id===input.assetId):undefined;if(input.assetId&&!asset)throw new Error('Selected asset does not belong to this campaign.');
 const poster=(chosen.override?.workflowId??(chosen.mode==='commercial_poster'?'commercial_poster_v1':''))==='commercial_poster_v1';
 const kinds:AssetKind[]=asset?[asset.kind as AssetKind]:poster?['hero']:assetSpecs.map(s=>s.kind);
 const selectedSource=input.commercialPoster?.sourceId??input.productHero?.sourceId;
 const references=c.uploads.filter(r=>!selectedSource||r.role!=='product'||r.id===selectedSource).filter(r=>!input.productHero?.styleId||!['style','reference'].includes(r.role)||r.id===input.productHero.styleId);
 return kinds.map(placement=>routeCreative({selection:chosen,placement,references}));
}
