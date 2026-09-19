import type {Evaluation,ImagePrompt} from '@/types/campaign';
import type {RepairRequest} from '@/types/repair';
import {scoreKeys} from '@/types/vision';
import {blockerChanges,reviewText} from '@/lib/review-comparison';
export const repairInstructions:Record<RepairRequest['targetType'],string>={face:'Restore coherent natural facial features while preserving expression and identity.',hand:'Restore one natural hand with plausible finger count and connection to the wrist.',foot:'Restore one complete realistic foot with natural contact and plausible ankle connection.',ankle:'Restore an anatomically plausible ankle connection between the lower leg and foot.',shoe:'Restore one complete realistic shoe with intact sole, coherent upper and natural foot and ankle connection.',product:'Restore coherent product geometry, intact edges and the existing product identity.',text_artifact:'Remove only the selected unwanted text or artifact; reconstruct the surrounding surface and texture.',generic_region:'Repair the selected local defect while preserving the intended subject and surrounding content.'};
export function repairPrompt(r:RepairRequest,source:ImagePrompt){return {positive:`${r.repairPrompt}\n${repairInstructions[r.targetType]} Preserve source lighting, perspective, colors, subject identity and surrounding composition. Lighting: ${source.lighting}. Camera: ${source.camera}. Style: ${source.style}.`,negative:`${r.negativeConstraints}, duplicated parts, warped geometry, mismatched lighting, extra limbs, missing foot, duplicated shoe, broken sole${r.targetType==='text_artifact'?', letters, numbers, watermark':''}`};}
export function repairSuggestion(e?:Evaluation|null){
 const issues=e?.provider==='openai'?e.blockingIssues??[]:[];
 const issue=issues[0],text=(issue?.observation??'')+' '+(issue?.recommendation??'');
 const target:RepairRequest['targetType']=/shoe|sole|sneaker/i.test(text)?'shoe':/ankle/i.test(text)?'ankle':/feet|foot/i.test(text)?'foot':/hand|finger/i.test(text)?'hand':/face|facial|eye/i.test(text)?'face':/text|bib|letter|watermark/i.test(text)?'text_artifact':issue?.category==='product'?'product':'generic_region';
 const global=issues.length>2||issues.some(i=>i.category==='composition');
 return {target,instruction:reviewText(issue?.recommendation)||repairInstructions[target],findingId:issue?'blocking:0':undefined,message:global?'Several or global defects are reported. Full regeneration is usually more appropriate; local repair requires choosing one region.':issues.length===1?'One blocker is reported. Local repair may help if you can isolate the defect; select and confirm the region.':'No single localized blocker is established. Choose a visible defect manually. Vision does not supply pixel-accurate coordinates.'};
}
export function repairOutcome(a?:Evaluation|null,b?:Evaluation|null){
 const changes=blockerChanges(a,b);
 if(!a||!b||a.provider!=='openai'||b.provider!=='openai'||a.model!==b.model||a.scoring?.policy!==b.scoring?.policy)return {label:'Review required — not comparable',changes};
 const down=scoreKeys.some(k=>b[k]<a[k]),up=scoreKeys.some(k=>b[k]>a[k]);
 return {label:changes?.added.length||down?(up||!!changes?.resolved.length?'Mixed result':'Worsened / new concerns'):up||changes?.resolved.length?'Improvement reported — verify visually':'No improvement established',changes};
}
