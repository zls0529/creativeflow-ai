import type {Evaluation} from '@/types/campaign';
import {brandBlockers} from '@/types/brand-intelligence';
import {reviewText} from '@/lib/review-comparison';
export function BrandCompliance({evaluation}:{evaluation?:Evaluation|null}){
 const c=evaluation?.brandCompliance;
 if(!c)return <details className="brand-compliance"><summary>Brand compliance · not evaluated</summary><p>No brand-rule evaluation was recorded for this version.</p></details>;
 const blockers=brandBlockers(evaluation!);
 return <details className="brand-compliance"><summary>Brand compliance · {c.findings.every(f=>f.status==='not_assessable')?'No visually assessed rules':blockers.length?blockers.length+' blockers':c.findings.some(f=>f.status==='possible_violation')?'Possible violations':'No violations reported'}</summary><p>Visual evidence only; not legal or absolute compliance. Non-assessable rules are not treated as violations.</p>{c.findings.map(f=>{const rule=c.rules.find(r=>r.id===f.ruleId);return <div className="finding-card" key={f.ruleId}><strong>{reviewText(rule?.text)||f.ruleId}</strong><p>{rule?.origin==='inferred'?'Inferred suggestion':rule?.binding?'Source-derived rule':'Source observation'}{rule?.edited?' · user edited':''}{rule?.page?' · page '+rule.page:''}</p><p>{f.status.replaceAll('_',' ')} · {f.severity} severity · {f.confidence} confidence</p><p><b>Observed</b> {reviewText(f.observation)}</p><p><b>Recommended</b> {reviewText(f.recommendation)}</p></div>;})}</details>;
}
