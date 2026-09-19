import { z } from 'zod';
export const conditioningStrengthSchema = z.object({product:z.number().min(0.05).max(1.5).optional(),style:z.number().min(0.05).max(1).optional()});
export type ConditioningStrength = z.infer<typeof conditioningStrengthSchema>;
export interface StoredImageReference { id:string; mime:string }
export const referenceConditioningSchema=z.object({
  mode:z.literal('ip-adapter'),model:z.string(),encoder:z.string(),
  references:z.array(z.object({id:z.string(),role:z.enum(['product','style']),strength:z.number(),weightType:z.enum(['linear','style transfer']),sha256:z.string()}))
});
export type ReferenceConditioning = z.infer<typeof referenceConditioningSchema>;
