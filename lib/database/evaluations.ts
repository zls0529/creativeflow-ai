import 'server-only';
import { db } from './client';
import { evaluationSchema, type Evaluation } from '@/types/campaign';
/** Keep prior reviews of the same generation, including mock evaluations, without overwriting history. */
export async function saveEvaluation(generationId: string, provider: string, value: Evaluation) {
  const evaluation = evaluationSchema.parse(value);
  return db.$transaction(async tx => {
    const previous = await tx.criticEvaluation.findUnique({where:{generationId}});
    const previousEvaluations = [];
    if (previous) {
      const { previousEvaluations: older = [], ...record } = evaluationSchema.parse(JSON.parse(previous.data));
      previousEvaluations.push(...older, { ...record, provider:previous.provider, evaluatedAt:previous.updatedAt.toISOString() });
    }
    const data = JSON.stringify({ ...evaluation,provider,previousEvaluations });
    return tx.criticEvaluation.upsert({where:{generationId},create:{generationId,provider,overall:evaluation.overall,data},update:{provider,overall:evaluation.overall,data}});
  });
}
