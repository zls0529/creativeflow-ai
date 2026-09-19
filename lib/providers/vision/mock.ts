import {measure} from '@/lib/usage/capture';
import type { VisionProvider, VisionRequest } from './base';
export class MockVisionProvider implements VisionProvider {
  readonly name = 'mock';
  async evaluate({ iteration }: VisionRequest) {
    return measure('mock','vision','vision_review',null,async()=>{
    const gain = Math.min(iteration, 2) * 12;
    return { brand_consistency: Math.min(96, 82 + gain), composition: Math.min(96, 68 + gain),
      visual_hierarchy: Math.min(96, 72 + gain), product_visibility: Math.min(98, 84 + gain),
      colour_consistency: Math.min(97, 83 + gain), campaign_relevance: Math.min(98, 86 + gain),
      visual_quality: Math.min(96, 73 + gain), prompt_adherence: Math.min(96, 68 + gain),
      overall: Math.min(96, 77 + gain), feedback: iteration === 0
        ? ['Brand palette provides a coherent foundation.', 'Reduce background detail to strengthen product separation.', 'Keep the product upright and soften the key light for a calmer premium finish.']
        : ['Product alignment and negative space are improved.', 'Soft directional light supports a consistent campaign mood.', 'Review packaging text and brand fidelity before publishing.'] };
    });
  }
}
