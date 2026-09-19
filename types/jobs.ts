import {routingSchema,workflowOverrideSchema} from './creative-mode';
import {commercialPosterInputSchema} from './commercial-poster';
import {productHeroInputSchema} from './product-hero';
import {repairRequestSchema} from './repair';
import {z} from 'zod';
import {conditioningStrengthSchema} from './reference';
export const jobInputSchema=z.object({routing:z.array(routingSchema).optional(),workflowOverride:workflowOverrideSchema.nullable().optional(),commercialPoster:commercialPosterInputSchema.optional(),productHero:productHeroInputSchema.optional(),campaignId:z.string().min(1).max(100),assetId:z.string().min(1).max(100).optional(),repair:repairRequestSchema.optional(),instruction:z.string().trim().min(3).max(2000).optional(),conditioningStrength:conditioningStrengthSchema.optional(),requestKey:z.string().min(8).max(100)}).refine(v=>!v.commercialPoster||(!!v.assetId&&!v.productHero&&!v.repair&&!v.instruction&&!v.conditioningStrength),'Commercial Poster requires one asset without other generation controls.').refine(v=>!v.productHero||(!!v.assetId&&!v.repair&&!v.instruction),'Product Hero requires one asset and no repair/refinement.').refine(v=>!v.instruction||!!v.assetId,'Refinement requires an asset.').refine(v=>!v.repair||(!!v.assetId&&!v.instruction),'Repair requires an asset and cannot be combined with full refinement.');
export type JobInput=z.infer<typeof jobInputSchema>;
export const activeJobStates=['queued','running','cancel_requested'];
export interface JobView {
 routing?:import('./creative-mode').RoutingDecision[];
 id:string;campaignId:string;assetId:string|null;action:string;status:string;stage:string;message:string;failure:string|null;failureCode:string|null;attempt:number;retryCount:number;createdAt:string;startedAt:string|null;completedAt:string|null;cancelRequestedAt:string|null;
 attempts:{number:number;status:string;failure:string|null;failureCode:string|null;createdAt:string;startedAt:string|null;completedAt:string|null}[];
 events:{id:string;attempt:number;stage:string;message:string;createdAt:string}[];
}
