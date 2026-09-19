import {z} from 'zod';
const text=z.string().trim().min(1).max(800);
export const ruleCategories=['personality','tone','primary_colours','secondary_colours','avoid_colours','typography','logo','photography','lighting','composition','product','audience','messaging','must_follow','avoid','visual_style'] as const;
export const extractedRuleSchema=z.object({category:z.enum(ruleCategories),text,origin:z.enum(['source','inferred']),evidence:text,page:z.number().int().min(1).nullable(),uncertainty:z.string().max(500),visuallyEvaluable:z.boolean()});
export const materialAnalysisSchema=z.object({summary:text,rules:z.array(extractedRuleSchema).max(40)});
export const brandRuleSchema=extractedRuleSchema.extend({id:z.string().min(1).max(80),sourceId:z.string().min(1).max(80),originalText:text,edited:z.boolean(),binding:z.boolean()});
export const brandSourceSchema=z.object({id:z.string(),name:z.string(),role:z.string(),mime:z.string(),sha256:z.string(),provider:z.string(),analysedAt:z.string(),summary:text});
export const brandConflictSchema=z.object({id:z.string(),stage:z.enum(['brief','direction','prompt']),requested:text,ruleId:z.string(),explanation:text,status:z.enum(['unresolved','user_override','guideline_enforced'])});
export const brandConstraintsSchema=z.object({revision:z.string(),approvedAt:z.string(),summary:z.string().max(2000),rules:z.array(brandRuleSchema).max(100),sources:z.array(brandSourceSchema).max(8),overriddenRuleIds:z.array(z.string()).max(100)});
export type BrandConstraints=z.infer<typeof brandConstraintsSchema>;
export type BrandRule=z.infer<typeof brandRuleSchema>;
export function visualEligibility(category:BrandRule['category'],suggested:boolean){
 if(['personality','tone','audience','messaging'].includes(category))return false;
 if(['primary_colours','secondary_colours','avoid_colours','visual_style','photography','lighting','composition','product'].includes(category))return true;
 return suggested;
}
export type BrandConflict=z.infer<typeof brandConflictSchema>;
export const brandIntelligenceSchema=z.object({draft:z.object({summary:z.string().max(2000),rules:z.array(brandRuleSchema).max(100),sources:z.array(brandSourceSchema).max(8)}).nullable(),approved:brandConstraintsSchema.nullable(),conflicts:z.array(brandConflictSchema).max(100)});
export type BrandIntelligence=z.infer<typeof brandIntelligenceSchema>;
export const emptyIntelligence=():BrandIntelligence=>({draft:null,approved:null,conflicts:[]});
export const complianceFindingSchema=z.object({ruleId:z.string(),status:z.enum(['satisfied','possible_violation','not_assessable']),confidence:z.enum(['low','medium','high']),severity:z.enum(['none','low','medium','high']),observation:text,recommendation:text});
export const brandComplianceSchema=z.object({revision:z.string(),rules:z.array(brandRuleSchema).max(100),findings:z.array(complianceFindingSchema).max(100)});
export function activeRules(c?:BrandConstraints|null){return c?.rules.filter(r=>!c.overriddenRuleIds.includes(r.id))||[];}
export function brandBlockers(e:{brandCompliance?:z.infer<typeof brandComplianceSchema>}){return e.brandCompliance?.findings.filter(f=>f.status==='possible_violation'&&f.confidence==='high'&&['medium','high'].includes(f.severity))||[];}
export function constraintContext(c?:BrandConstraints|null){return c?{revision:c.revision,rules:activeRules(c).map(({id,category,text,origin,binding,visuallyEvaluable})=>({id,category,text,origin,binding,visuallyEvaluable})),policy:'Approved binding source rules are authoritative; source observations are context, not mandates. Inferred suggestions are optional style guidance. User-overridden rules are excluded.'}:undefined;}
