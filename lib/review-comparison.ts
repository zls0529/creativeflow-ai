import type {Evaluation,GenerationView,ImagePrompt} from '@/types/campaign';
import {scoreKeys} from '@/types/vision';

export function reviewText(value:unknown):string {
  return typeof value==='string' ? value.replace(/\bsk-[\w-]{8,}\b/g,'[redacted]').replace(/[A-Za-z]:[\\/][^\n;,]+|\\\\[^\n;,]+|\/(?:Users|home|tmp|var|mnt|etc|opt)\/[^\n;,]+/g,'[local path hidden]') : '';
}
export function visionLabel(e?:Evaluation|null){return !e?'No Vision evaluation':e.provider==='mock'?'Mock Vision':e.provider==='openai'?'OpenAI Vision · real':e.provider?`${reviewText(e.provider)} critic`:'Vision provider not recorded';}
export function imageLabel(g:GenerationView){return g.provider==='mock'?'Mock SVG':g.provider==='comfyui'?'Real ComfyUI image':`${reviewText(g.provider) || 'Unknown'} image provider`;}
export function scoreRows(a?:Evaluation|null,b?:Evaluation|null){return (['overall',...scoreKeys] as const).map(key=>{
  const left=typeof a?.[key]==='number'?a[key]:null,right=typeof b?.[key]==='number'?b[key]:null;
  return {key,label:key.replaceAll('_',' '),left,right,delta:left===null||right===null?null:right-left};
});}
export function scoreChange(a?:Evaluation|null,b?:Evaluation|null){
  if(!a||!b)return 'Not comparable';const deltas=scoreRows(a,b).map(r=>r.delta).filter((d):d is number=>d!==null);
  return deltas.some(d=>d>0)&&deltas.some(d=>d<0)?'Mixed result':deltas.some(d=>d>0)?'Improved':deltas.some(d=>d<0)?'Worsened':'Unchanged';
}
export function blockerChanges(a?:Evaluation|null,b?:Evaluation|null){
  if(!a?.blockingIssues||!b?.blockingIssues)return null;
  const left=new Set(a.blockingIssues.map(i=>i.category)),right=new Set(b.blockingIssues.map(i=>i.category));
  return {resolved:[...left].filter(c=>!right.has(c)),added:[...right].filter(c=>!left.has(c)),persistent:[...left].filter(c=>right.has(c))};
}
export function stoppingReason(g:GenerationView){
  const c=g.context,s=c?.stopReason || '';
  if(g.status==='evaluation_failed')return 'Vision evaluation failed';
  if(g.status==='image_failed')return 'Image provider failure';
  if(c?.refinementFailure)return /invalid|schema/i.test(c.refinementFailure)?'Refinement output invalid':'Refinement provider failure';
  if(/invalid refinement/i.test(s))return 'Refinement output invalid';
  if(/MAX_REFINEMENTS|maximum refinements/i.test(s))return 'Maximum refinements reached · human review required';
  if(/threshold met/i.test(s))return 'Threshold met · no blocking issues';
  if(/provider failure/i.test(s))return 'Provider failure';
  return s?reviewText(s):'Stopping reason not recorded';
}
export function workflowInfo(g:GenerationView){
  const details=g.context?.detailPasses || [];
  const pose=details.find(d=>d.startsWith('Pose conditioning applied:'));
  const poseId=pose?.match(/pose reference ([a-zA-Z0-9-]+)/)?.[1];
  return {mode:g.context?.workflowMode || 'Not recorded',reason:g.context?.workflowReason || 'Selection reason not recorded',pose:pose?{id:poseId,strength:pose.match(/strength ([\d.]+)/)?.[1],model:pose.match(/model ([^;]+)/)?.[1]}:null,
    face:details.some(d=>d==='Detail pass applied: face')?'FaceDetailer · pixels changed':details.find(d=>/Face detail stage/.test(d)) || 'No face pass recorded',
    references:g.context?.referenceConditioning?.references || [],referenceMode:g.context?.referenceConditioning?.mode || null};
}
export type DiffPart={text:string;kind:'same'|'added'|'removed'};
export function textDiff(before:string,after:string):DiffPart[]{
  const a=reviewText(before),b=reviewText(after);if(a===b)return [{text:a,kind:'same'}];
  const left=a.match(/\S+\s*/g)||[],right=b.match(/\S+\s*/g)||[];
  if(left.length*right.length>250000)return [{text:a,kind:'removed'},{text:b,kind:'added'}];
  const table=Array.from({length:left.length+1},()=>new Uint16Array(right.length+1));
  for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)table[i][j]=left[i].trim()===right[j].trim()?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const parts:DiffPart[]=[];let i=0,j=0;
  const push=(text:string,kind:DiffPart['kind'])=>{const last=parts.at(-1);if(last?.kind===kind)last.text+=text;else parts.push({text,kind});};
  while(i<left.length||j<right.length){
    if(i<left.length&&j<right.length&&left[i].trim()===right[j].trim()){push(right[j++],'same');i++;}
    else if(i<left.length&&(j===right.length||table[i+1][j]>=table[i][j+1]))push(left[i++],'removed');else push(right[j++],'added');
  }return parts;
}
export function promptChanges(a:ImagePrompt,b:ImagePrompt){return Object.keys({...a,...b}).map(key=>({key,before:a[key as keyof ImagePrompt] || '',after:b[key as keyof ImagePrompt] || ''})).filter(f=>f.before!==f.after).map(f=>({...f,parts:textDiff(f.before,f.after)}));}
