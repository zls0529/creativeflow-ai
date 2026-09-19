import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/database/client';
import {analyseMaterial} from './materials';
import {readIntelligence,saveIntelligence} from './store';
import {brandIntelligenceSchema,type BrandIntelligence} from '@/types/brand-intelligence';
import type {LLMProvider} from '@/lib/providers/llm/base';
import {resolveConflict,guardBrand} from './conflicts';
export const editSchema=z.object({id:z.string(),text:z.string().trim().min(1).max(800),visuallyEvaluable:z.boolean(),binding:z.boolean()});
export function approveRules(intelligence:BrandIntelligence,edits:z.infer<typeof editSchema>[]){
 const draft=intelligence.draft;if(!draft)throw new Error('Analyse brand materials before approving rules.');
 if(new Set(edits.map(e=>e.id)).size!==edits.length)throw new Error('Duplicate rule IDs are not allowed.');
 const rules=edits.map(e=>{const original=draft.rules.find(r=>r.id===e.id);if(!original)throw new Error('Unknown rule. Refresh the panel before saving.');return {...original,text:e.text,binding:original.origin==='source'&&e.binding,visuallyEvaluable:e.visuallyEvaluable,edited:original.edited||e.binding!==original.binding||e.text!==original.originalText||e.visuallyEvaluable!==original.visuallyEvaluable};});
 const unchanged=new Set(rules.filter(r=>intelligence.approved?.rules.some(old=>old.id===r.id&&old.text===r.text&&old.binding===r.binding)).map(r=>r.id));
 return brandIntelligenceSchema.parse({...intelligence,draft:{...draft,rules},approved:{...draft,rules,revision:randomUUID(),approvedAt:new Date().toISOString(),overriddenRuleIds:intelligence.approved?.overriddenRuleIds.filter(id=>unchanged.has(id))||[]},conflicts:intelligence.conflicts.filter(c=>unchanged.has(c.ruleId))});
}
export async function analyseBrandFiles(id:string,llm:LLMProvider,sourceIds?:string[]){
 const uploads=await db.upload.findMany({where:{campaignId:id,role:{in:['guidelines','logo','reference','style','product']},...(sourceIds?{id:{in:sourceIds}}:{})}});
 if(sourceIds&&(new Set(sourceIds).size!==sourceIds.length||uploads.length!==sourceIds.length))throw new Error('Selected brand sources must belong to this campaign. Refresh and retry.');
 if(!uploads.length)throw new Error('Upload a guideline, logo, style/reference or product image first.');
 const results=[];for(const upload of uploads)results.push(await analyseMaterial(upload,llm));
 if(results.reduce((n,r)=>n+r.rules.length,0)>100)throw new Error('Too many extracted rules (maximum 100). Use a shorter set of brand materials. The previous draft is preserved.');
 const {intelligence}=await readIntelligence(id);
 intelligence.draft={summary:results.map(r=>r.source.summary).join('\n').slice(0,2000),rules:results.flatMap(r=>r.rules),sources:results.map(r=>r.source)};
 // Save only after every source succeeds, keeping approved rules intact on analysis failure.
 await saveIntelligence(id,intelligence);return intelligence;
}
export async function resolveBrandConflict(id:string,conflictId:string,status:'guideline_enforced'|'user_override'){
 const {intelligence}=await readIntelligence(id),conflict=intelligence.conflicts.find(c=>c.id===conflictId);
 if(!conflict||!intelligence.approved)throw new Error('Conflict not found. Refresh Brand Intelligence.');
 conflict.status=status;intelligence.approved=resolveConflict(intelligence.approved,conflict,status);
 await saveIntelligence(id,intelligence);
}
export async function checkBrandBrief(id:string,llm:LLMProvider){const c=await db.campaign.findUniqueOrThrow({where:{id}});const {intelligence}=await readIntelligence(id);if(!intelligence.approved)throw new Error('Approve brand rules first.');await guardBrand(id,llm,intelligence.approved,'brief',{brief:c.brief,style:c.style,colours:JSON.parse(c.colours),objective:c.objective});}
