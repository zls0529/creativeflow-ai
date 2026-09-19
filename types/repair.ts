import {z} from 'zod';
export const repairTargets=['face','hand','foot','ankle','shoe','product','text_artifact','generic_region'] as const;
export const regionSchema=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).strict().refine(r=>r.x+r.width<=1.000001&&r.y+r.height<=1.000001&&r.width*r.height<=0.6,'Select a bounded local region covering at most 60% of the image.');
export const repairRequestSchema=z.object({sourceGenerationId:z.string().min(1).max(100),targetType:z.enum(repairTargets),selection:z.enum(['manual','auto_face']),region:regionSchema.optional(),repairPrompt:z.string().trim().min(12).max(1600),negativeConstraints:z.string().trim().max(1000).default(''),repairReason:z.string().trim().min(3).max(800),sourceCriticFindingId:z.string().regex(/^(blocking:\d{1,2}|integrity:[a-z_]+)$/).optional(),workflowMode:z.literal('inpaint_repair').default('inpaint_repair'),userConfirmed:z.literal(true),useProductReference:z.boolean().default(false)}).strict().superRefine((r,c)=>{
 if(r.selection==='manual'&&!r.region)c.addIssue({code:'custom',message:'Manual repair requires a region.'});
 if(r.selection==='auto_face'&&(r.targetType!=='face'||r.region||r.useProductReference))c.addIssue({code:'custom',message:'Automatic selection supports face repair only, without a manual region or product reference.'});
});
export type RepairRequest=z.infer<typeof repairRequestSchema>;
export type RepairRegion=z.infer<typeof regionSchema>;
export const repairMetadataSchema=z.object({request:repairRequestSchema,sourceVersion:z.number().int().positive(),maskId:z.string().uuid().optional(),maskMethod:z.string(),outsideMaskUnchanged:z.boolean().optional(),changedPixels:z.number().int().nonnegative().optional(),settings:z.object({denoise:z.number(),steps:z.number(),cfg:z.number(),sampler:z.string(),scheduler:z.string(),seed:z.number()}).optional()});
export type RepairMetadata=z.infer<typeof repairMetadataSchema>;
