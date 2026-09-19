'use client';
import {BrandCompliance} from './brand-compliance';
import {brandBlockers} from '@/types/brand-intelligence';
import {BlockingIssues,VisionFindings} from './generation-review';
import {visionLabel,reviewText} from '@/lib/review-comparison';

import { useState } from 'react';
import type { Evaluation } from '@/types/campaign';
import { scoreKeys } from '@/types/vision';
export function CriticReview({ evaluation, threshold }: { evaluation: Evaluation; threshold: number }) {
  const [selected,setSelected] = useState('latest');
  const review = selected === 'latest' ? evaluation : evaluation.previousEvaluations?.[Number(selected)] ?? evaluation;
  const mock = review.provider === 'mock';
  const hasBlockers=!!review.blockingIssues?.length||!!brandBlockers(review).length;
  return <>
    <div className="eyebrow">{visionLabel(review)}{review.model ? ' · '+reviewText(review.model) : ''}</div>
    {!!evaluation.previousEvaluations?.length && <label>Saved review <select aria-label="Saved critic review" value={selected} onChange={e=>setSelected(e.target.value)}><option value="latest">Latest evaluation</option>{evaluation.previousEvaluations.map((r,i)=><option key={i} value={i}>{r.provider || 'Provider unknown'} · {r.evaluatedAt}</option>)}</select></label>}
    <div className="review-score"><strong>{review.overall}<small>/100</small></strong><span className={review.overall >= threshold && !hasBlockers ? 'success-text' : 'warning-text'}>{hasBlockers ? 'Blocking defects found' : review.overall >= threshold ? 'Meets quality target' : 'Needs creative review'}</span></div>
    <p className="mock-note">{mock ? 'Simulated evaluation. Scores demonstrate the workflow and are not visual measurements.' : 'AI visual review of the generated image. Findings may be uncertain or incomplete; human approval remains necessary.'} Current target {threshold}/100; historical target not recorded.</p>
    {review.scoring && <p className="small muted">Component mean {review.scoring.componentMean}/100 · defect penalty {review.scoring.penalty || 0} · defect cap {review.scoring.cap}/100.</p>}
    <BlockingIssues evaluation={review}/>
    <BrandCompliance evaluation={review}/>
    <div className="score-list">{scoreKeys.map(key=><div key={key}><div><span>{key.replaceAll('_',' ')}</span><b>{review[key]}</b></div><span className="score-track"><span style={{width:`${review[key]}%`}}/></span></div>)}</div>
    <h3>Vision findings</h3><VisionFindings evaluation={review}/>
  </>;
}
