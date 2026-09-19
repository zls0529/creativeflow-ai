'use client';
import {ReproducibilityPanel} from './reproducibility';
import {RepairDetails} from './repair-details';
import {useState} from 'react';
import type {CampaignView,Evaluation,GenerationView} from '@/types/campaign';
import {imageLabel,visionLabel,workflowInfo,stoppingReason,reviewText} from '@/lib/review-comparison';
export function ReviewImage({generation:g}:{generation:GenerationView}){
 const [failed,setFailed]=useState(false);
 return <div className="review-image">{g.imageUrl&&!failed?<img src={g.imageUrl} alt={'Campaign artwork, version '+g.version} onError={()=>setFailed(true)}/>:<div className="review-image-empty"><strong>{g.status==='image_failed'?'Generation failed':'Image unavailable'}</strong><p>{failed?'The saved image could not be loaded.':reviewText(g.context?.error)||'No image was saved for this version.'}</p></div>}</div>;
}
export function BlockingIssues({evaluation:e}:{evaluation?:Evaluation|null}){
 return <section className="review-blockers"><h4>Blocking issues</h4>{!e?<p>No evaluation available.</p>:!e.blockingIssues?<p>Blocker details were not recorded in this review.</p>:!e.blockingIssues.length?<p>No blockers reported in this review.</p>:e.blockingIssues.map((issue,i)=><div className="blocker-card" key={i}><div><span className={'severity '+issue.severity}>{issue.severity}</span><strong>{issue.category.replaceAll('_',' ')}</strong></div><p><b>Observed</b> {reviewText(issue.observation)}</p><details><summary>Interpretation & recommendation</summary><p><b>Interpreted</b> {reviewText(issue.interpretation)}</p><p><b>Recommended</b> {reviewText(issue.recommendation)}</p></details></div>)}</section>;
}
export function VisionFindings({evaluation:e}:{evaluation?:Evaluation|null}){
 if(!e)return <p>No Vision findings available.</p>;
 return <>{e.findings?.map((f,i)=><div className="finding-card" key={i}><p><b>Observed</b> {reviewText(f.observation)}</p><p><b>Interpreted</b> {reviewText(f.interpretation)}</p><p><b>Recommended</b> {reviewText(f.recommendation)}</p></div>)}{!e.findings&&<><p>Legacy feedback · observation and recommendation were not stored separately.</p>{e.feedback.map((f,i)=><p key={i}>{reviewText(f)}</p>)}</>}{e.integrity&&<details><summary>Image integrity checks</summary><p>Visible people: {e.integrity.visible_people??'Uncertain'}</p>{Object.entries(e.integrity).filter(([,v])=>v&&typeof v==='object').map(([key,v])=>v&&typeof v==='object'&&<div key={key} className="finding-card"><h4>{key.replaceAll('_',' ')} · {v.status}</h4><p><b>Observed</b> {reviewText(v.observation)}</p><p><b>Interpreted</b> {reviewText(v.interpretation)}</p><p><b>Recommended</b> {reviewText(v.recommendation)}</p></div>)}</details>}</>;
}
export function GenerationMetadata({generation:g,campaign}:{generation:GenerationView;campaign:CampaignView}){
 const info=workflowInfo(g);
 const refLabel=(id:string)=>{const name=campaign.uploads.find(r=>r.id===id)?.name;return name?reviewText(name.split(/[\\/]/).at(-1)):id;};
 return <div className="generation-metadata"><ReproducibilityPanel generation={g}/><RepairDetails generation={g} source={campaign.assets.flatMap(a=>a.generations).find(v=>v.id===g.context?.repair?.request.sourceGenerationId)}/><dl><div><dt>Generation workflow</dt><dd>{reviewText(info.mode)}</dd></div><div><dt>Image provider</dt><dd>{imageLabel(g)}</dd></div><div><dt>Vision provider</dt><dd>{visionLabel(g.evaluation)}{g.evaluation?.model?' · '+reviewText(g.evaluation.model):''}</dd></div><div><dt>Conditioning</dt><dd>{info.pose?'OpenPose ControlNet':'No pose conditioning recorded'}</dd></div><div><dt>Detail pass</dt><dd>{reviewText(info.face)}</dd></div></dl><p className="muted">{reviewText(info.reason)}</p>
 {info.pose&&<p>Pose reference: {info.pose.id?<a href={'/api/uploads/'+info.pose.id} target="_blank" rel="noreferrer">{refLabel(info.pose.id)}</a>:'ID not recorded'} · strength {info.pose.strength??'not recorded'}<br/>{reviewText(info.pose.model)}</p>}
 <h4>Reference inputs used</h4>{info.references.length?info.references.map(ref=><p key={ref.role}>{ref.role} · {info.referenceMode} · strength {ref.strength}<br/><a href={'/api/uploads/'+encodeURIComponent(ref.id)} target="_blank" rel="noreferrer">{refLabel(ref.id)}</a></p>):<p>No product/style conditioning recorded.</p>}
 </div>;
}
export function StopReason({generation:g}:{generation:GenerationView}){return <div className="stop-reason"><strong>Refinement status</strong><p>{stoppingReason(g)}</p>{(g.context?.error||g.context?.refinementFailure)&&<p className="warning-text">{reviewText(g.context.error||g.context.refinementFailure)}</p>}</div>;}
export function StoredPrompt({generation:g}:{generation:GenerationView}){return <dl className="stored-prompt">{Object.entries(g.prompt).map(([key,value])=><div key={key}><dt>{key==='negative_prompt'?'Negative constraints':key.replaceAll('_',' ')}</dt><dd>{reviewText(value)||'Not recorded'}</dd></div>)}</dl>;}
