import {activeRules,type BrandConstraints,complianceFindingSchema} from '@/types/brand-intelligence';
import {z} from 'zod';
export function validateCompliance(c:BrandConstraints,findings:z.infer<typeof complianceFindingSchema>[]){
 const rules=activeRules(c),ids=new Set(findings.map(f=>f.ruleId));
 if(ids.size!==findings.length||findings.length!==rules.length||findings.some(f=>!rules.some(r=>r.id===f.ruleId)))throw new Error('Brand compliance response omitted or duplicated rules. Retry the evaluation.');
 return {revision:c.revision,rules,findings:findings.map(f=>{const rule=rules.find(r=>r.id===f.ruleId)!;return (!rule.visuallyEvaluable||['audience','tone','messaging'].includes(rule.category))?{...f,status:'not_assessable' as const,severity:'none' as const,observation:'This rule cannot be assessed from image pixels.',recommendation:'Review this rule outside visual evaluation.'}:(rule.origin==='inferred'||!rule.binding)?{...f,severity:'none' as const}:f;})};
}
