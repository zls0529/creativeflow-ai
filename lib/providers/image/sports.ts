import type { ImageRequest } from './base';
import type { Evaluation } from '@/types/campaign';
import { qualityPrompts, selectWorkflow } from './quality';
export const sportsNegatives = ['missing foot','incomplete feet','malformed foot','deformed shoe','twisted ankle','multiple people','bad face','distorted face','broken anatomy','cropped shoes','fused shoes'];
export function sportsPrompts(request: Pick<ImageRequest,'prompt'>) {
  const base = qualityPrompts(request);
  return { positive:`Single athlete, one subject only. Two clearly defined legs, complete feet inside the frame, anatomically plausible ankles and feet, sharp shoe structure, realistic face and natural facial features. Preserve sports-advertising photography, clear subject separation and credible athletic motion. Motion blur restricted to background and environmental elements.\n${base.positive}`, negative:[...new Set([...base.negative.split(',').map(s=>s.trim().toLowerCase()),...sportsNegatives])].join(', ') };
}
export function refinementWorkflowPreference(evaluation:Evaluation, request:Pick<ImageRequest,'prompt'|'direction'>) {
  const anatomy = evaluation.blockingIssues?.some(i=>i.category==='anatomy');
  const shoes = evaluation.blockingIssues?.some(i=>/shoe|foot|feet|ankle/i.test(`${i.observation} ${i.recommendation}`));
  if ((anatomy || shoes) && selectWorkflow('auto',request).mode === 'sports') return {mode:'sports' as const,reason:'Sports preferred: anatomy or shoe blocking issue in a dynamic human scene.'};
  if (anatomy) return {mode:'quality' as const,reason:'Quality preferred: anatomy blocking issue in the previous evaluation.'};
  return undefined;
}
