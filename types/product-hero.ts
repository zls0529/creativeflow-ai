import {z} from 'zod';
import {sha256Schema} from './workflow';
export const productBlockers=['product_geometry_drift','product_missing_part','product_logo_loss','product_colour_drift','duplicated_product','weak_product_prominence','obvious_composite_seam'] as const;
export const normalizedRegion=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(0.02).max(1),height:z.number().min(0.02).max(1)}).refine(r=>r.x+r.width<=1&&r.y+r.height<=1,'Region must fit inside source.');
export const productHeroInputSchema=z.object({
 sourceId:z.string().regex(/^[a-zA-Z0-9-]+$/),styleId:z.string().regex(/^[a-zA-Z0-9-]+$/).optional(),
 segmentation:z.enum(['auto','sam','source_alpha','background_removal','manual']).default('auto'),
 manualMaskId:z.string().uuid().optional(),manualMaskConfirmed:z.boolean().default(false),
 sourceRegion:normalizedRegion.default({x:0.02,y:0.02,width:0.96,height:0.96}),
 placement:z.enum(['center','left','right','lower-center','custom']).default('right'),
 position:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).default({x:0.5,y:0.6}),
 scale:z.number().min(0.25).max(0.8).default(0.62),margin:z.number().min(0.03).max(0.15).default(0.06),
 copySpace:z.enum(['none','left','right']).default('left'),
 backgroundDirection:z.string().trim().max(1500).default(''),seed:z.number().int().min(0).max(4294967295).default(2026091701),
 reflection:z.boolean().default(false),edgeIntegration:z.boolean().default(true),
}).strict();
export type ProductHeroInput=z.infer<typeof productHeroInputSchema>;
export const maskDiagnosticsSchema=z.object({coverage:z.number(),componentCount:z.number().int(),significantComponents:z.number().int(),largestComponentRatio:z.number(),smallFragmentRatio:z.number(),boundsFill:z.number(),accepted:z.boolean(),reasons:z.array(z.string()),width:z.number(),height:z.number()});
export const segmentationAttemptSchema=z.object({method:z.string(),model:z.string().nullable(),maskUrl:z.string().optional(),maskSha256:sha256Schema.optional(),diagnostics:maskDiagnosticsSchema.optional(),accepted:z.boolean(),reason:z.string().optional(),templateHash:sha256Schema.optional(),guidance:normalizedRegion.optional()});
export const segmentationReportSchema=z.object({id:z.string().uuid(),sourceId:z.string(),sourceSha256:sha256Schema,sourceImageUrl:z.string(),createdAt:z.string(),attempts:z.array(segmentationAttemptSchema),accepted:z.boolean(),selectedMethod:z.string().nullable(),userIntervention:z.boolean(),maskUrl:z.string().optional(),maskSha256:sha256Schema.optional()});
export type SegmentationReport=z.infer<typeof segmentationReportSchema>;
export const productFidelityReviewSchema=z.object({
 level:z.enum(['high','medium','low','not_assessable']),
 silhouette:z.string().min(1).max(800),structure:z.string().min(1).max(800),colour:z.string().min(1).max(800),logoText:z.string().min(1).max(800),
 lighting:z.string().min(1).max(800),seams:z.string().min(1).max(800),
 findings:z.array(z.object({category:z.enum(productBlockers),severity:z.enum(['low','medium','high']),observation:z.string().min(1).max(800),recommendation:z.string().min(1).max(800)})).max(12),
});
export const productHeroMetadataSchema=z.object({
 input:productHeroInputSchema,sourceSha256:sha256Schema,sourceImageUrl:z.string(),maskUrl:z.string(),foregroundUrl:z.string(),backgroundUrl:z.string(),
 segmentation:z.object({method:z.string(),model:z.string().nullable(),sourceWidth:z.number(),sourceHeight:z.number(),maskSha256:sha256Schema,report:segmentationReportSchema.optional()}),
 contract:z.literal('preserve-transformed-opaque-core-v1'),
 placement:z.object({left:z.number(),top:z.number(),width:z.number(),height:z.number(),sourceBounds:z.object({left:z.number(),top:z.number(),width:z.number(),height:z.number()}),kernel:z.literal('lanczos3')}),
 backgroundPrompt:z.object({positive:z.string(),negative:z.string()}),
 shadow:z.literal('procedural-contact-and-soft-cast-v1'),reflection:z.boolean(),
 integration:z.string(),edgeFeatherPx:z.number(),inpaint:z.literal('none'),upscale:z.literal('none; compose at final resolution'),
 fidelity:z.object({corePixels:z.number().int(),coreChangedPixels:z.number().int(),coreMeanAbsoluteError:z.number(),maskCoverage:z.number(),status:z.enum(['core_preserved_identity_unreviewed','failed']),limitations:z.array(z.string())}),
 durationsMs:z.object({segmentation:z.number(),background:z.number(),compositing:z.number(),repair:z.literal(0),total:z.number()}),
 visionProvider:z.string().default('not_reviewed'),review:productFidelityReviewSchema.optional(),
});
export type ProductHeroMetadata=z.infer<typeof productHeroMetadataSchema>;
