import {productBlockers,productFidelityReviewSchema} from './product-hero';
import { z } from 'zod';
import {brandComplianceSchema} from './brand-intelligence';
export const componentScores = z.object({
  brand_consistency: z.number().int().min(0).max(100), composition: z.number().int().min(0).max(100),
  visual_hierarchy: z.number().int().min(0).max(100), product_visibility: z.number().int().min(0).max(100),
  colour_consistency: z.number().int().min(0).max(100), campaign_relevance: z.number().int().min(0).max(100),
  visual_quality: z.number().int().min(0).max(100), prompt_adherence: z.number().int().min(0).max(100)
});
export const scoreKeys = Object.keys(componentScores.shape) as (keyof z.infer<typeof componentScores>)[];
const description = z.string().min(1).max(1200);
const finding = z.object({ observation: description, interpretation: description, recommendation: description });
export const blockingIssueSchema = finding.extend({ category: z.enum(['anatomy','product','composition','prompt_adherence','other',...productBlockers]), severity: z.enum(['medium','high']) });
const check = finding.extend({ status: z.enum(['clear','concern','not_visible','not_applicable']), severity: z.enum(['none','low','medium','high']) });
export const integritySchema = z.object({
  visible_people: z.number().int().min(0).max(100).nullable(),
  limb_plausibility: check, duplicated_limbs: check, leg_arm_anatomy: check, feet_ankles: check,
  hands: check, body_proportions: check, pose_plausibility: check,
  product_structure: check, duplicated_product_parts: check, product_prominence: check
});
export const visionOutputSchema = componentScores.extend({
  integrity: integritySchema, blockingIssues: z.array(blockingIssueSchema).max(12), findings: z.array(finding).min(1).max(10)
});
export type VisionOutput = z.infer<typeof visionOutputSchema>;
export const evaluationDetails = {
  productFidelity:productFidelityReviewSchema.optional(),
  brandCompliance:brandComplianceSchema.optional(),
  provider: z.string().optional(), model: z.string().optional(),
  integrity: integritySchema.optional(), blockingIssues: z.array(blockingIssueSchema).optional(), findings: z.array(finding).optional(),
  scoring: z.object({ policy: z.enum(['component-mean-with-defect-caps-v1','component-mean-with-defect-penalties-v2']), componentMean: z.number().min(0).max(100), penalty: z.number().min(0).max(100).optional(), cap: z.number().min(0).max(100) }).optional()
};
