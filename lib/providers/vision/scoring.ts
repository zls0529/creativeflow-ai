import { scoreKeys, visionOutputSchema, blockingIssueSchema, type VisionOutput } from '@/types/vision';
import type { Evaluation } from '@/types/campaign';
export function scoreVision(value: VisionOutput, model: string,additionalIssues:NonNullable<Evaluation['blockingIssues']>=[]): Evaluation {
  const result = visionOutputSchema.parse(value);
  const blockingIssues = [...result.blockingIssues,...blockingIssueSchema.array().parse(additionalIssues)];
  // A structural concern cannot disappear from the score just because the model omitted it from its issue list.
  for (const [key, check] of Object.entries(result.integrity)) {
    if (!check || typeof check !== 'object' || check.status !== 'concern' || !['medium','high'].includes(check.severity)) continue;
    const category = key.startsWith('product') || key === 'duplicated_product_parts' ? 'product' : 'anatomy';
    if (!blockingIssues.some(issue => issue.observation === check.observation && issue.severity === check.severity)) blockingIssues.push({ category, severity: check.severity as 'medium' | 'high', observation: check.observation, interpretation: check.interpretation, recommendation: check.recommendation });
  }
  const componentMean = Math.round(scoreKeys.reduce((sum,key) => sum + result[key],0) / scoreKeys.length);
  const cap = blockingIssues.some(issue=>issue.severity === 'high') ? 49 : blockingIssues.length ? 69 : 100;
  // Count each category once at its highest severity, so repeated descriptions do not inflate the penalty.
  const categoryPenalties = new Map<string, number>();
  for (const issue of blockingIssues) categoryPenalties.set(issue.category, Math.max(categoryPenalties.get(issue.category) || 0, issue.severity === 'high' ? 20 : 8));
  const penalty = Math.min(100, [...categoryPenalties.values()].reduce((sum,n)=>sum+n,0));
  return { ...result, blockingIssues, provider:'openai',model, overall: Math.max(0,Math.min(componentMean - penalty,cap)),
    scoring:{ policy:'component-mean-with-defect-penalties-v2',componentMean,penalty,cap },
    feedback: [...blockingIssues,...result.findings].map(f=>`Observation: ${f.observation} Interpretation: ${f.interpretation} Recommended correction: ${f.recommendation}`)
  };
}
