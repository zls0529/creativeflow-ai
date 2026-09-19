import type {ProductHeroMetadata} from '@/types/product-hero';
import type { AssetKind, Brand, Direction, Evaluation, ImagePrompt } from '@/types/campaign';
import type {BrandConstraints} from '@/types/brand-intelligence';
export interface VisionRequest { posterReference?:{id:string;sha256:string}; productHero?:ProductHeroMetadata; brandConstraints?:BrandConstraints; imageUrl: string; prompt: ImagePrompt; brand: Brand; direction: Direction; iteration: number; objective: string; placement: AssetKind; version: number }
export interface VisionProvider { readonly name: string; evaluate(request: VisionRequest): Promise<Evaluation> }
