import {z} from 'zod';
export const creativeModeSchema=z.enum(['commercial_poster','product_hero','lifestyle','sports','social_fast','custom']);
export type CreativeMode=z.infer<typeof creativeModeSchema>;
export const workflowOverrideSchema=z.object({workflowId:z.string().regex(/^[a-z][a-z0-9_]+$/),version:z.literal('1.0.0'),reason:z.string().trim().min(3).max(300)}).strict();
export const creativeSelectionSchema=z.object({mode:creativeModeSchema,override:workflowOverrideSchema.optional()}).strict().refine(v=>v.mode!=='custom'||!!v.override,'Custom mode requires a registered workflow selection.');
export type CreativeSelection=z.infer<typeof creativeSelectionSchema>;
export const routingSchema=z.object({creativeMode:creativeModeSchema,placement:z.enum(['hero','post','story','banner','product']),recommended:z.object({id:z.string(),version:z.string()}),selected:z.object({id:z.string(),version:z.string()}),providerMode:z.enum(['commercial_poster_v1','product_hero_v1','basic','quality','sports','sports_pose']),reason:z.string(),maturity:z.string(),requirements:z.array(z.string()),warnings:z.array(z.string()),blockers:z.array(z.string()),fallbackRecommendation:z.string().nullable(),override:workflowOverrideSchema.optional(),referenceIds:z.array(z.string()),productSourceId:z.string().optional()});
export type RoutingDecision=z.infer<typeof routingSchema>;
