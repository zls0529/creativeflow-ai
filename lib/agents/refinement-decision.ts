import type { Evaluation } from '@/types/campaign';
import {brandBlockers} from '@/types/brand-intelligence';
export function refinementDecision(evaluation: Evaluation, threshold: number, iteration: number, max: number) {
  const categories:string[] = [...new Set((evaluation.blockingIssues || []).map(issue=>issue.category))];
  if(brandBlockers(evaluation).length)categories.push('brand compliance');
  if (evaluation.overall >= threshold && !categories.length) return { refine:false,acceptable:true,reason:'Refinement stopped: threshold met; no blocking issues.' };
  if (iteration >= max) return { refine:false,acceptable:false,reason:`Refinement stopped: MAX_REFINEMENTS reached (${max}); ${categories.length ? `${categories.join(', ')} blocking issues remain` : `score ${evaluation.overall} below target ${threshold}`}.` };
  return { refine:true,acceptable:false,reason:categories.length ? `Refinement triggered: ${categories.join(', ')} blocking issue.` : `Refinement triggered: score ${evaluation.overall} below target ${threshold}.` };
}
