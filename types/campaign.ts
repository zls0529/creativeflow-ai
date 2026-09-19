import { z } from 'zod';
import {creativeSelectionSchema} from './creative-mode';
import type { GenerationContext } from './refinement';
import { evaluationDetails } from './vision';
import type {BrandIntelligence} from './brand-intelligence';

export const briefSchema = z.object({
  creative:creativeSelectionSchema.optional(),
  name: z.string().trim().min(2).max(100), brandName: z.string().trim().min(2).max(80),
  objective: z.string().trim().min(5).max(1000), audience: z.string().trim().min(3).max(500),
  brief: z.string().trim().min(15).max(5000), style: z.string().trim().min(2).max(300),
  colours: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(6)
});
export type Brief = z.infer<typeof briefSchema>;
export const brandSchema = z.object({
  brand_personality: z.array(z.string()), target_audience: z.string(), visual_keywords: z.array(z.string()),
  avoid: z.array(z.string()), primary_colours: z.array(z.string()), campaign_goal: z.string(), product: z.string()
});
export type Brand = z.infer<typeof brandSchema>;
export const directionSchema = z.object({
  concept: z.string(), campaign_idea: z.string(), visual_direction: z.string(), lighting: z.string(),
  composition: z.string(), colour_palette: z.array(z.string()), photography_style: z.string(), mood: z.string(),
  recommended_assets: z.array(z.string())
});
export type Direction = z.infer<typeof directionSchema>;
export const promptSchema = z.object({
  subject: z.string(), environment: z.string(), composition: z.string(), camera: z.string(), lighting: z.string(),
  colour_palette: z.string(), style: z.string(), brand_constraints: z.string(), negative_prompt: z.string()
});
export type ImagePrompt = z.infer<typeof promptSchema>;
const score = z.number().int().min(0).max(100);
const evaluationRecordSchema = z.object({
  brand_consistency: score, composition: score, visual_hierarchy: score, product_visibility: score,
  colour_consistency: score, campaign_relevance: score, visual_quality: score, prompt_adherence: score,
  overall: score, feedback: z.array(z.string()), ...evaluationDetails
});
export const evaluationSchema = evaluationRecordSchema.extend({ previousEvaluations: z.array(evaluationRecordSchema.extend({ evaluatedAt: z.string() })).optional() });
export type Evaluation = z.infer<typeof evaluationSchema>;
export const assetSpecs = [
  { kind: 'hero', name: 'Hero campaign', width: 1600, height: 1200, composition: 'Product on the right third; generous negative space on the left for campaign copy.' },
  { kind: 'post', name: 'Instagram post', width: 1080, height: 1080, composition: 'Square, centered product with a sculptural plinth and balanced margins.' },
  { kind: 'story', name: 'Instagram story', width: 1080, height: 1920, composition: 'Vertical composition; product in lower half, leave top and bottom 15% clear for UI.' },
  { kind: 'banner', name: 'Website banner', width: 1920, height: 640, composition: 'Wide panoramic scene; product on far right, copy-safe area across left half.' },
  { kind: 'product', name: 'Product image', width: 1200, height: 1200, composition: 'Close-up product study, legible label, tactile detail and uncluttered backdrop.' }
] as const;
export type AssetKind = typeof assetSpecs[number]['kind'];
export const stages = ['Brand Analysis', 'Creative Direction', 'Prompt Creation', 'Image Generation', 'Vision Review', 'Refinement', 'Completed'] as const;
export type Stage = typeof stages[number];
export type RunState = 'pending' | 'running' | 'completed' | 'failed';
export interface Run { id: string; stage: string; status: string; message: string; createdAt: string }
export interface GenerationView { jobId?:string|null;jobAttempt?:number|null;status?: string; context?: GenerationContext; id: string; version: number; prompt: ImagePrompt; imageUrl: string; provider: string; reason: string; evaluation: Evaluation | null; createdAt: string }
export interface AssetView { id: string; kind: AssetKind; name: string; width: number; height: number; status: string; prompt: ImagePrompt; generations: GenerationView[] }
export interface CampaignView extends Brief {
  brandIntelligence?: BrandIntelligence; constraintsRevision?: string;
  id: string; status: string; error: string | null; createdAt: string; updatedAt: string;
  brandProfile: Brand | null; direction: Direction | null; assets: AssetView[]; runs: Run[];
  uploads: { id: string; name: string; role: string; mime: string; size: number }[];
}
export interface CampaignSummary { id: string; name: string; brandName: string; status: string; updatedAt: string; _count: { assets: number } }
