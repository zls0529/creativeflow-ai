import {routingSchema} from './creative-mode';
import {commercialPosterMetadataSchema} from './commercial-poster';
import {productHeroMetadataSchema,segmentationReportSchema} from './product-hero';
import {reproducibilitySchema} from './workflow';
import {referenceConditioningSchema} from './reference';
import {repairMetadataSchema} from './repair';
import {brandConstraintsSchema} from './brand-intelligence';
import { z } from 'zod';
import { promptSchema } from './campaign';
export const refinementOutputSchema = z.object({
  prompt: promptSchema,
  reason: z.string().trim().min(10).max(800),
  targetedCorrections: z.array(z.string().trim().min(10).max(800)).min(1).max(8)
});
export const generationContextSchema = z.object({
  routing:routingSchema.optional(),
  workflowMode: z.string(), workflowReason: z.string(), previousGenerationId: z.string().nullable(), previousVersion: z.number().int().nullable(),
  refinementIndex: z.number().int().min(0), targetedCorrections: z.array(z.string()),
  referenceConditioning:referenceConditioningSchema.optional(),
  repair:repairMetadataSchema.optional(),
  reproducibility:reproducibilitySchema.optional(),
  commercialPoster:commercialPosterMetadataSchema.optional(),
  productHero:productHeroMetadataSchema.optional(),
  segmentation:segmentationReportSchema.optional(),
  brandConstraints:brandConstraintsSchema.optional(),
  detailPasses: z.array(z.string()).optional(), stopReason: z.string().optional(), error: z.string().optional(), refinementFailure: z.string().optional()
});
export type GenerationContext = z.infer<typeof generationContextSchema>;
