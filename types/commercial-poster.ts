import {z} from 'zod';
export const commercialPosterInputSchema=z.object({sourceId:z.string().regex(/^[a-zA-Z0-9-]+$/),seed:z.number().int().min(0).max(4294967295).default(20260919),width:z.literal(880).default(880),height:z.literal(592).default(592)}).strict();
export type CommercialPosterInput=z.infer<typeof commercialPosterInputSchema>;
export const commercialPosterMetadataSchema=z.object({input:commercialPosterInputSchema,promptAdapter:z.literal('klein-poster-v1'),positivePrompt:z.string(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),durationMs:z.number().nonnegative(),reviewStatus:z.literal('not_requested'),status:z.literal('experimental')});
export type CommercialPosterMetadata=z.infer<typeof commercialPosterMetadataSchema>;
