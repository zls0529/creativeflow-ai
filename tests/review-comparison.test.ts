import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockerChanges,imageLabel,promptChanges,reviewText,scoreChange,scoreRows,stoppingReason,textDiff,visionLabel,workflowInfo} from '../lib/review-comparison';
import {scoreKeys} from '../types/vision';
import type {Evaluation,GenerationView,ImagePrompt} from '../types/campaign';
const evaluation=(score:number,provider='openai'):Evaluation=>({...Object.fromEntries(scoreKeys.map(k=>[k,score])) as Record<(typeof scoreKeys)[number],number>,overall:score,provider,feedback:[],blockingIssues:[]});
const generation=(extra:Partial<GenerationView>={})=>({id:'one',version:1,provider:'comfyui',imageUrl:'',prompt:{} as ImagePrompt,reason:'Initial',createdAt:'2026-09-17T00:00:00.000Z',evaluation:null,...extra} as GenerationView);
test('evaluated versions compare all persisted dimensions and overall with B minus A',()=>{
 const a=evaluation(62),b=evaluation(80);const rows=scoreRows(a,b);assert.equal(rows.length,9);assert.equal(rows.find(r=>r.key==='product_visibility')?.delta,18);assert.equal(scoreChange(a,b),'Improved');assert.equal(scoreChange(b,a),'Worsened');assert.equal(scoreChange(a,a),'Unchanged');
});
test('mixed numeric changes produce no winner even if overall increases',()=>{
 const a=evaluation(70),b={...evaluation(80),composition:60};assert.equal(scoreChange(a,b),'Mixed result');assert.equal(scoreRows(a,b).find(r=>r.key==='composition')?.delta,-10);
});
test('missing review remains unknown, never a zero score',()=>{
 assert.equal(scoreChange(null,evaluation(80)),'Not comparable');assert.equal(scoreRows(null,evaluation(80))[0].left,null);assert.equal(scoreRows(null,evaluation(80))[0].delta,null);assert.equal(visionLabel(null),'No Vision evaluation');
});
test('real and mock image/review labels do not guess missing providers',()=>{
 assert.equal(visionLabel(evaluation(89,'mock')),'Mock Vision');assert.match(visionLabel(evaluation(63)),/OpenAI Vision.*real/);assert.match(visionLabel({...evaluation(5),provider:undefined}),/not recorded/);assert.equal(imageLabel(generation({provider:'mock'})),'Mock SVG');assert.equal(imageLabel(generation()),'Real ComfyUI image');
});
const issue=(category:'anatomy'|'product'|'composition',observation='Visible issue')=>({category,severity:'high' as const,observation,interpretation:'Meaning',recommendation:'Change'});
test('blockers compare categories, deduplicate and retain persistent categories with different wording',()=>{
 const a={...evaluation(49),blockingIssues:[issue('anatomy'),issue('product'),issue('product','Another issue')]};
 const b={...evaluation(69),blockingIssues:[issue('product','Completely different observation'),issue('composition')]};
 assert.deepEqual(blockerChanges(a,b),{resolved:['anatomy'],added:['composition'],persistent:['product']});
 assert.equal(blockerChanges({...a,blockingIssues:undefined},b),null);assert.equal(blockerChanges(null,b),null);
});
test('prompt diff marks additions/removals and negative constraints, retaining stored text',()=>{
 const a={subject:'runner with motion blur on limbs',negative_prompt:'watermark'} as ImagePrompt;
 const b={subject:'runner with anatomically plausible ankles',negative_prompt:'watermark, deformed shoe'} as ImagePrompt;
 const changes=promptChanges(a,b);assert.equal(changes.length,2);assert.ok(changes[0].parts.some(p=>p.kind==='added'&&p.text.includes('anatomically plausible ankles')));assert.ok(changes[0].parts.some(p=>p.kind==='removed'&&p.text.includes('motion blur')));assert.equal(changes[1].key,'negative_prompt');assert.deepEqual(promptChanges(a,a),[]);
 const parts=textDiff('a b c','a new c');assert.equal(parts.filter(p=>p.kind!=='added').map(p=>p.text).join(''),'a b c');assert.equal(parts.filter(p=>p.kind!=='removed').map(p=>p.text).join(''),'a new c');
});
test('stopping reasons distinguish failed phases, limits, historical missing metadata and threshold',()=>{
 assert.equal(stoppingReason(generation({status:'evaluation_failed'})),'Vision evaluation failed');assert.equal(stoppingReason(generation({status:'image_failed'})),'Image provider failure');assert.equal(stoppingReason(generation()),'Stopping reason not recorded');
 const g=generation({context:{workflowMode:'sports',workflowReason:'auto',previousVersion:1,previousGenerationId:'old',refinementIndex:1,targetedCorrections:[],stopReason:'Refinement stopped: MAX_REFINEMENTS reached (1); score below target.'}});
 assert.match(stoppingReason(g),/Maximum refinements/);g.context!.stopReason='Refinement stopped: threshold met; no blocking issues.';assert.match(stoppingReason(g),/Threshold met/);g.context!.refinementFailure='Invalid refinement output';assert.equal(stoppingReason(g),'Refinement output invalid');
});
test('workflow display reuses persisted pose/detail/reference metadata, without inferring from mode',()=>{
 const g=generation({context:{workflowMode:'sports_pose',workflowReason:'Auto',previousVersion:null,previousGenerationId:null,refinementIndex:0,targetedCorrections:[],detailPasses:['Pose conditioning applied: OpenPose body only; model pose.safetensors; strength 0.8; start 0; end 0.85; pose reference abc-123','Detail pass applied: face'],referenceConditioning:{mode:'ip-adapter',model:'adapter',encoder:'encoder',references:[{role:'product',id:'product-123',strength:0.7,weightType:'linear',sha256:'hash'}]}}});
 const info=workflowInfo(g);assert.equal(info.pose?.id,'abc-123');assert.equal(info.pose?.strength,'0.8');assert.equal(info.references[0].strength,0.7);assert.match(info.face,/FaceDetailer/);assert.equal(workflowInfo(generation()).mode,'Not recorded');g.context!.detailPasses=[];assert.equal(workflowInfo(g).pose,null);
});
test('display redacts local paths and accidental secret-like values',()=>{
 assert.equal(reviewText('Failed C:\\Users\\private\\image.png'),'Failed [local path hidden]');assert.equal(reviewText('Read /home/user/image.png'),'Read [local path hidden]');assert.equal(reviewText('sk-testsecretvalue123'),'[redacted]');
});
