import type {CommercialPosterInput,CommercialPosterMetadata} from '@/types/commercial-poster';
import type {ProductHeroInput,ProductHeroMetadata} from '@/types/product-hero';
import type {Reproducibility} from '@/types/workflow';
import type {StoredImageReference,ConditioningStrength,ReferenceConditioning} from '@/types/reference';
import type {ProviderRepairRequest} from './repair';
import type {RepairMetadata} from '@/types/repair';
import type { AssetKind, Brand, Direction, ImagePrompt } from '@/types/campaign';
export interface ImageRequest {
  forcedWorkflow?:'basic'|'quality'|'sports'|'sports_pose';
  commercialPoster?:CommercialPosterInput; commercialPosterPrompt?:string;
  productHero?:ProductHeroInput; onStage?:(stage:string)=>Promise<void>;
  prompt: ImagePrompt; brand: Brand; direction: Direction; brandName: string; kind: AssetKind;
  productReference?: StoredImageReference; styleReference?: StoredImageReference; conditioningStrength?: ConditioningStrength;
  qualityPreference?: { reason: string; mode?: 'quality' | 'sports' };
  width: number; height: number; version: number; references: { id: string; role: string; mime: string }[];
}
export interface ImageResult { commercialPoster?:CommercialPosterMetadata; productHero?:ProductHeroMetadata; reproducibility?:Reproducibility; repair?:RepairMetadata; referenceConditioning?: ReferenceConditioning; detailPasses?: string[]; imageUrl: string; provider: string }
export interface ImageGenerationProvider { readonly name: string; repair?(request:ProviderRepairRequest):Promise<ImageResult>; resolveWorkflow?(request: ImageRequest): Promise<{mode:string;reason:string}>; workflow?(request: ImageRequest): { mode: string; reason: string }; describe?(request: ImageRequest): string; dimensions?(kind: AssetKind): { width: number; height: number }; generate(request: ImageRequest): Promise<ImageResult> }
