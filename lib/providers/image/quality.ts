import type { ImageRequest } from './base';
export type WorkflowMode = 'basic' | 'quality' | 'sports' | 'sports_pose' | 'auto';
export type SelectedWorkflow = 'basic' | 'quality' | 'sports' | 'sports_pose';
export const qualityBaseSizes = {
  hero: { width: 768, height: 576 }, post: { width: 640, height: 640 },
  story: { width: 512, height: 896 }, banner: { width: 1152, height: 384 }, product: { width: 640, height: 640 }
};
const humans = /\b(person|people|human|runner|runners|athlete|athletes|man|woman|men|women|boy|girl|model|dancer|pedestrian|hands?|legs?|arms?|full[- ]body|portrait|jogging|sprinting)\b/i;
const dynamic = /\b(running|sprinting|jogging|jumping|dancing|athletic|in motion|dynamic pose|mid[- ]stride)\b/i;
const isolated = /\b(product[- ]only|no (?:people|person|human|model)|isolated (?:shoe|product|sneaker)|(?:shoe|product|sneaker) (?:only|alone))\b/i;
export function selectWorkflow(mode: WorkflowMode, request: Pick<ImageRequest, 'prompt' | 'direction'> & Partial<Pick<ImageRequest,'kind'>>): { mode: SelectedWorkflow; reason: string } {
  if (mode !== 'auto') return { mode, reason: `Explicit ${mode} mode` };
  const subject = `${request.prompt.subject} ${request.prompt.composition}`;
  if(request.kind === 'product' && !humans.test(subject)) return {mode:'basic',reason:'Auto: product placement without an explicit human subject; campaign motion context does not add a person'};
  if (isolated.test(subject)) return { mode: 'basic', reason: 'Auto: explicit product-only/no-person composition' };
  if (dynamic.test(subject.replace(/running shoes?/gi,'shoe')) && humans.test(subject)) return {mode:'sports',reason:'Auto: dynamic human/sports subject'};
  if (humans.test(subject) || dynamic.test(subject.replace(/running shoes?/gi, 'shoe'))) return { mode: 'quality', reason: 'Auto: human or dynamic subject in placement prompt' };
  // Do not use the brand audience or negative prompt: they commonly mention people/limbs for product-only shots.
  const context = `${request.prompt.environment} ${request.prompt.style} ${JSON.stringify(request.direction || {})}`;
  if (humans.test(context) && dynamic.test(context)) return { mode: 'sports', reason: 'Auto: human/dynamic creative context' };
  return { mode: 'basic', reason: 'Auto: no human/dynamic signal' };
}
export const anatomyNegatives = ['extra limbs','extra legs','duplicated limbs','fused limbs','malformed legs','twisted ankles','deformed feet','extra feet','missing limbs','disconnected limbs','unnatural pose','bad anatomy','bad proportions','duplicate person','multiple bodies','malformed hands','distorted joints','blurry limbs','blurry shoes'];
export function qualityPrompts(request: Pick<ImageRequest, 'prompt'>) {
  const { negative_prompt, ...positive } = request.prompt;
  const running = /\b(run(?:ner|ning|ners)?|sprint\w*|jogg\w*)\b/i.test(`${positive.subject} ${positive.composition}`);
  const constraints = `sharp anatomically correct subject, natural body proportions, clearly separated limbs, sharp shoes and limbs${running ? ', clearly defined two legs and two arms, natural running biomechanics' : ''}, motion blur restricted to background and environmental elements and light trails; subject body structure remains sharp`;
  // Remove conflicting blur instructions before adding the single scoped constraint.
  const clean = (text: string) => text.replace(/\b(?:strong |heavy |dramatic )?motion[- ]blur(?: (?:on|across|over) (?:the )?(?:subject|body|limbs|legs|arms|runner))?/gi, 'sharp subject detail').replace(/\b(?:blurred|blurry) (body|limbs|legs|arms|runner|subject)\b/gi, 'sharp $1').trim();
  const text = Object.entries(positive).map(([key,value]) => `${key.replaceAll('_',' ')}: ${clean(value)}`).join('\n');
  const negatives = [...negative_prompt.split(/[,;\n]+/), ...anatomyNegatives].map(s => s.trim()).filter(Boolean);
  return { positive: `${constraints}.\n${text}`, negative: [...new Map(negatives.map(s => [s.toLowerCase(),s])).values()].join(', ') };
}
