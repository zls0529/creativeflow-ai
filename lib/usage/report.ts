import 'server-only';
import {db} from '@/lib/database/client';
import type {UsageRow,UsageTotals,UsageReport} from '@/types/usage';
export type UsageFilter={campaignId?:string;jobId?:string;attempt?:number;assetId?:string;generationId?:string};
export function aggregate(rows:UsageRow[]):UsageTotals{
 const sum=(key:'inputTokens'|'outputTokens'|'cachedTokens'|'totalTokens')=>rows.some(r=>r[key]!==null)?rows.reduce((n,r)=>n+(r[key]??0),0):null;
 const api=rows.filter(r=>r.provider==='openai'),local=rows.filter(r=>r.provider==='comfyui');
 const cost=(r:UsageRow[])=>r.some(e=>e.estimatedCostUsd!==null)?r.reduce((n,e)=>n+(e.estimatedCostUsd??0),0):null;
 return {calls:rows.length,failed:rows.filter(r=>r.status==='failed').length,pending:rows.filter(r=>r.status==='pending').length,inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cachedTokens:sum('cachedTokens'),totalTokens:sum('totalTokens'),apiCostUsd:cost(api),unpricedApiCalls:api.filter(r=>r.estimatedCostUsd===null).length,localCalls:local.length,localCompleted:local.filter(r=>r.status==='success').length,localDurationMs:local.reduce((n,r)=>n+(r.durationMs??0),0),localCostUsd:cost(local),unpricedLocalCalls:local.filter(r=>r.estimatedCostUsd===null).length,mockCalls:rows.filter(r=>r.provider==='mock').length,refinementCalls:rows.filter(r=>r.operation==='llm_refinement').length};
}
export async function usageReport(filter:UsageFilter):Promise<UsageReport>{
 const records=await db.usageEvent.findMany({where:filter,orderBy:[{createdAt:'desc'},{id:'desc'}]});
 const rows=records.map(r=>({...r,createdAt:r.createdAt.toISOString()}));
 const grouped=new Map<string,UsageRow[]>();for(const r of rows){const key=JSON.stringify([r.provider,r.category,r.model]);const group=grouped.get(key)??[];group.push(r);grouped.set(key,group);}
 // Explicitly expose earlier uninstrumented versions, including mixed old/new campaigns.
 const old=await db.generation.count({where:{...(filter.campaignId?{asset:{campaignId:filter.campaignId}}:{}),...(filter.assetId?{assetId:filter.assetId}:{}),...(filter.generationId?{id:filter.generationId}:{}),...(filter.jobId?{jobId:filter.jobId}:{}),...(filter.attempt?{jobAttempt:filter.attempt}:{}),NOT:{id:{in:rows.flatMap(r=>r.generationId&&r.category==='image'?[r.generationId]:[])}}}});
 const modes=new Map<string,UsageRow[]>();for(const r of rows){const m=JSON.parse(r.metadata);const key=JSON.stringify([m.creativeMode??'Not recorded',m.workflowId??m.workflow??'Not recorded']);modes.set(key,[...(modes.get(key)??[]),r]);}
 return {routingGroups:[...modes].map(([key,rs])=>{const [creativeMode,workflowId]=JSON.parse(key);return {creativeMode,workflowId,totals:aggregate(rs)};}),totals:aggregate(rows),groups:[...grouped.values()].map(r=>({provider:r[0].provider,category:r[0].category,model:r[0].model,totals:aggregate(r)})),events:rows.slice(0,100),eventCount:rows.length,olderHistoryUnrecorded:old>0};
}
export async function exportUsage(filter:UsageFilter){
 const events=await db.usageEvent.findMany({where:filter,orderBy:[{createdAt:'asc'},{id:'asc'}]});
 return JSON.stringify({schemaVersion:1,currency:'USD',notice:'Estimated costs, not billing totals. Null means unavailable. Duration is provider wall-clock time. Older usage was not recorded.',events},null,2);
}
