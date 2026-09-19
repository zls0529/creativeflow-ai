import {checkProductHeroReadiness} from '@/lib/product-hero/readiness';
import type {ProductHeroInput} from '@/types/product-hero';
import {checkRepairReadiness} from '@/lib/repair/readiness';
import type {RepairRequest} from '@/types/repair';
import 'server-only';
import {z} from 'zod';
import {ComfyUIProvider} from '@/lib/providers/image/comfyui';
import {poseDependencyError} from '@/lib/providers/image/pose';
import {referenceDependencies} from '@/lib/providers/image/reference-workflow';
import {openAIConfiguration} from '@/lib/providers/openai/responses';
import {refinementWorkflowPreference} from '@/lib/providers/image/sports';
import type {ImageRequest} from '@/lib/providers/image/base';
import {assetSpecs,type CampaignView,type ImagePrompt} from '@/types/campaign';
import type {ReadinessItem,ReadinessReport} from '@/types/readiness';
import type {ConditioningStrength} from '@/types/reference';
import {reviewText} from '@/lib/review-comparison';

type Environment=Record<string,string|undefined>;
export interface ReadinessOptions {skipRouting?:boolean;routing?:import('@/types/creative-mode').RoutingDecision[];workflowOverride?:import('@/types/creative-mode').CreativeSelection['override']|null;commercialPoster?:import('@/types/commercial-poster').CommercialPosterInput;productHero?:ProductHeroInput;repair?:RepairRequest;campaign?:CampaignView|null;assetId?:string;refine?:boolean;conditioningStrength?:ConditioningStrength;purpose?:'generation'|'brand_analysis';requests?:ImageRequest[]}
const catalogSchema=z.record(z.object({input:z.object({required:z.record(z.array(z.unknown())).default({}),optional:z.record(z.array(z.unknown())).optional()}).optional()}));
export function safeReadinessText(value:string,env:Environment){let clean=value;for(const [key,secret] of Object.entries(env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key)&&secret)clean=clean.split(secret).join('[redacted]');return reviewText(clean).slice(0,600);}
function safeName(value:string,env:Environment){return safeReadinessText(value.split(/[\\/]/).at(-1)||'not set',env);}
export function readinessRequests(options:ReadinessOptions):{requests:ImageRequest[];provisional:boolean}{
 if(options.requests)return {requests:options.requests,provisional:false};
 const c=options.campaign;
 const assets=c?.assets.filter(a=>options.assetId?a.id===options.assetId:!['ready','approved','needs_review'].includes(a.status))||[];
 // Settings can inspect completed campaigns too; a full rerun itself skips completed assets.
 const selected=assets.length?assets:options.assetId?[]:c?.assets||[];
 const missing=options.assetId?[]:assetSpecs.filter(spec=>!c?.assets.some(a=>a.kind===spec.kind));
 const approved=c?.brandIntelligence?.approved;
 const changed=!!approved&&(c?.constraintsRevision!==approved.revision||selected.some(a=>a.generations.length&&a.generations.at(-1)?.context?.brandConstraints?.revision!==approved.revision));
 const provisional=!selected.length||missing.length>0||changed||!!options.refine;
 const specs=selected.length?[...selected,...missing]:assetSpecs;
 return {provisional,requests:specs.map(spec=>{
  const latest='generations' in spec?spec.generations.at(-1):undefined;
  const fallback:ImagePrompt={subject:c?.brief||'Product campaign',composition:'composition' in spec?spec.composition:'',environment:'',camera:'',lighting:'',colour_palette:c?.colours.join(', ')||'',style:c?.style||'',brand_constraints:'',negative_prompt:''};
  const prompt=latest?.prompt??('prompt' in spec?spec.prompt:fallback);
  return {prompt,brand:c?.brandProfile??{brand_personality:[],target_audience:'',visual_keywords:[],avoid:[],primary_colours:[],campaign_goal:'',product:''},direction:c?.direction??{concept:'',campaign_idea:'',visual_direction:c?.brief||'',lighting:'',composition:'',colour_palette:[],photography_style:c?.style||'',mood:'',recommended_assets:[]},brandName:c?.brandName||'',kind:spec.kind,width:spec.width,height:spec.height,version:(latest?.version||0)+1,references:c?.uploads||[],conditioningStrength:options.conditioningStrength,...(options.refine&&latest?.evaluation?{qualityPreference:refinementWorkflowPreference(latest.evaluation,{prompt,direction:c!.direction!})}:{})};
 })};
}
export async function checkReadiness(options:ReadinessOptions={},dependencies:{env?:Environment;fetch?:typeof fetch;timeoutMs?:number}={}):Promise<ReadinessReport>{
 if(!options.skipRouting&&options.purpose!=='brand_analysis'&&!options.requests&&!options.repair&&(options.routing?.length||options.campaign?.creative||options.workflowOverride))return (await import('@/lib/workflows/routing-readiness')).checkRoutingReadiness(options,dependencies);
 if(options.commercialPoster)return (await import('@/lib/commercial-poster/readiness')).checkCommercialPosterReadiness(options.campaign,options.assetId,options.commercialPoster,dependencies);
 if(options.productHero)return checkProductHeroReadiness(options.campaign,options.assetId,options.productHero,dependencies);
 if(options.repair)return checkRepairReadiness(options.campaign,options.assetId,options.repair,dependencies);
 const env=dependencies.env??process.env,items:ReadinessItem[]=[],modes=new Set<string>();
 const add=(id:string,name:string,status:ReadinessItem['status'],explanation:string,remediation?:string,severity:ReadinessItem['severity']=status==='unavailable'?'blocking':status==='warning'?'warning':'informational')=>items.push({id,name,status,severity,explanation:safeReadinessText(explanation,env),...(remediation?{remediation:safeReadinessText(remediation,env)}:{})});
 const analysis=options.purpose==='brand_analysis';
 function openAI(kind:'LLM'|'Vision'){
  const provider=env[kind==='LLM'?'LLM_PROVIDER':'VISION_PROVIDER']||'mock';
  if(provider==='mock'){add(kind,kind+' · mock','ready','Mock provider selected intentionally; no credentials or remote model required.');return;}
  if(provider!=='openai'){add(kind,kind,'unavailable','Unsupported provider name.','Select mock or openai in the server environment.');return;}
  try{const config=openAIConfiguration(kind==='LLM'?'OPENAI_MODEL':'VISION_MODEL',kind==='LLM'?'gpt-4.1-mini':'gpt-4.1',env);
   if(kind==='Vision'&&/^(text-|gpt-3|whisper|tts-|dall-e|o1-mini|o1-preview)/.test(config.model))throw new Error('Vision model must support image inputs and structured output.');
   add(kind,kind+' · OpenAI','configured',safeName(config.model,env)+' configured. Authentication, quota, model access and network are not verified; no OpenAI request was sent.');
  }catch(e){add(kind,kind+' · OpenAI','unavailable',e instanceof Error?e.message:'Invalid provider configuration.','Fix server configuration and restart the application.');}
 }
 openAI('LLM');
 if(analysis){add('vision','Vision','not_required','Brand material analysis uses the LLM adapter, not the campaign Vision Critic.');add('brand','Brand Intelligence',(env.LLM_PROVIDER||'mock')==='mock'?'warning':items.some(i=>i.severity==='blocking')?'unavailable':'configured',(env.LLM_PROVIDER||'mock')==='mock'?'Mock analysis returns no extracted rules.':'Uses the configured LLM model; image capability and authentication are not verified.');for(const name of ['ComfyUI','Checkpoint','Workflow','OpenPose / ControlNet','FaceDetailer','IP-Adapter / CLIP Vision'])add(name,name,'not_required','Not used for brand material analysis.');return finish();}
 openAI('Vision');
 add('brand','Brand Intelligence','not_required','Generation uses saved approved rules; new material analysis is not requested.');
 if(options.campaign?.brandIntelligence?.approved?.rules.length&&(env.VISION_PROVIDER||'mock')==='mock')add('brand-vision','Brand compliance','unavailable','Approved brand rules require real Vision in the current campaign workflow.','Configure VISION_PROVIDER=openai.');
 if(options.assetId&&!options.campaign?.assets.some(a=>a.id===options.assetId))add('asset','Selected asset','unavailable','The selected asset does not belong to this campaign.');
 const image=env.IMAGE_PROVIDER||'mock';
 if(image==='mock'){
  add('image','Image · mock','ready','Mock SVG image provider selected intentionally.');
  if((env.VISION_PROVIDER||'mock')==='openai')add('compatibility','Image / Vision compatibility','unavailable','Real Vision requires generated PNGs; the mock image provider returns SVGs.','Use mock Vision with mock images, or select ComfyUI.');
  for(const name of ['ComfyUI','Checkpoint','Workflow','OpenPose / ControlNet','FaceDetailer','IP-Adapter / CLIP Vision'])add(name,name,'not_required','Not used by the mock image provider.');
  if(options.campaign?.uploads.some(u=>['pose','product','style','reference'].includes(u.role)))add('refs','Reference inputs','warning','Mock images do not perform real pose or reference conditioning.');
  return finish();
 }
 if(image!=='comfyui'){add('image','Image provider','unavailable','Unsupported image provider.','Select mock or comfyui.');return finish();}
 let provider:ComfyUIProvider;
 try{provider=new ComfyUIProvider(env);add('image','Image · ComfyUI','configured','Server-side configuration validated.');}catch(e){add('image','ComfyUI configuration','unavailable',e instanceof Error?e.message:'Invalid ComfyUI configuration.','Correct the named server setting and restart the app.');return finish();}
 const {requests,provisional}=readinessRequests(options);
 let capabilities:z.infer<typeof catalogSchema>|undefined;
 const signal=AbortSignal.timeout(dependencies.timeoutMs??5000);
 try{
  const base=new URL(env.COMFYUI_URL!);const response=await (dependencies.fetch??fetch)(new URL(base.pathname.replace(/\/$/,'')+'/object_info',base),{method:'GET',signal,redirect:'error',cache:'no-store'});
  if(!response.ok)throw new Error('http');
  if(!response.body)throw new Error('malformed');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024){await reader.cancel();throw new Error('malformed');}chunks.push(value);}
  capabilities=catalogSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));if(!Object.keys(capabilities).length)throw new Error('malformed');
  add('comfy','ComfyUI API','ready','The read-only object_info endpoint responded with valid node metadata. No job was queued.');
 }catch{add('comfy','ComfyUI API','unavailable',signal.aborted?'ComfyUI readiness timed out.':'ComfyUI is unreachable or returned invalid node metadata.','Start ComfyUI and check COMFYUI_URL, then Recheck.');}
 const checked=new Set<string>();let usesPose=false,usesFace=false,usesRefs=false;
 for(const request of requests){
  // Before a prompt exists, conservatively validate all auto candidates. A mode can also change during refinement.
  const potential=provisional&&(env.COMFYUI_WORKFLOW_MODE==='auto')?(['basic','quality','sports'] as const):[undefined];
  for(const candidate of potential){
   const required=provider.readinessRequirements(request,candidate);
   usesPose ||=required.pose;usesFace ||=required.face;usesRefs ||=required.references;modes.add(required.mode);
   let plan:Awaited<ReturnType<ComfyUIProvider['readinessPlan']>>;
   try{plan=await provider.readinessPlan(request,candidate);}catch(e){const message=e instanceof Error?e.message:'Invalid workflow or reference input.';if(!checked.has(message)){checked.add(message);add('template-'+items.length,'Workflow / reference inputs','unavailable',message,'Restore the repository template or fix the selected reference input.');}continue;}
   usesPose ||=plan.pose;usesFace ||=plan.face;usesRefs ||=plan.references;modes.add(plan.mode);
   const key=plan.mode+'-'+plan.references;if(checked.has(key))continue;checked.add(key);
   add('template-'+key,'Template · '+plan.mode,'ready','Repository template and selected stored reference inputs validated.');
   if(!capabilities)continue;
   const checkpoint=capabilities.CheckpointLoaderSimple?.input?.required.ckpt_name?.[0];
   if(!items.some(i=>i.id==='checkpoint'))add('checkpoint','Checkpoint',Array.isArray(checkpoint)&&checkpoint.includes(plan.checkpoint)?'ready':'unavailable',safeName(plan.checkpoint,env)+(Array.isArray(checkpoint)&&checkpoint.includes(plan.checkpoint)?' is visible to ComfyUI.':' is not visible to ComfyUI.'),'Verify the configured checkpoint filename and refresh ComfyUI model discovery.');
   if(plan.pose&&!items.some(i=>i.id==='pose')){const error=poseDependencyError(capabilities,plan.poseModel);add('pose','OpenPose / ControlNet',error?'unavailable':'ready',error||safeName(plan.poseModel,env)+' and required nodes are advertised.','Install/enable the documented OpenPose dependencies, then Recheck.');}
   if(plan.references&&!items.some(i=>i.id==='adapter')){try{referenceDependencies(capabilities,plan.adapter,plan.encoder);add('adapter','IP-Adapter / CLIP Vision','ready',safeName(plan.adapter,env)+' and '+safeName(plan.encoder,env)+' are advertised.');}catch(e){add('adapter','IP-Adapter / CLIP Vision','unavailable',e instanceof Error?e.message:'Reference dependencies unavailable.','Restore the documented SD1.5 reference nodes/models.');}}
   const missing:string[]=[];
   if(plan.face){const detectors=capabilities.UltralyticsDetectorProvider?.input?.required.model_name?.[0];if(!Array.isArray(detectors)||!detectors.includes(plan.graph['20'].inputs.model_name))missing.push('UltralyticsDetectorProvider / model_name');}
   for(const node of Object.values(plan.graph)){
    const info=capabilities[node.class_type]?.input;if(!info){missing.push(node.class_type);continue;}
    for(const [name,value] of Object.entries(node.inputs)){
     // LoadImage advertises already-uploaded files. Readiness intentionally does not upload a new one.
     if(node.class_type==='LoadImage'&&name==='image')continue;
     const choices=(info.required[name]||info.optional?.[name])?.[0];
     if(Array.isArray(choices)&&typeof value==='string'&&!choices.includes(value))missing.push(node.class_type+' / '+name);
    }
   }
   add('nodes-'+key,'Workflow nodes · '+plan.mode,missing.length?'unavailable':'ready',missing.length?'Missing node or unsupported configured selection: '+[...new Set(missing)].join(', '):'Required graph nodes and advertised model/sampler selections are available.','Check the named node/model configuration in ComfyUI.');
   if(plan.face&&!items.some(i=>i.id==='face')){const faceMissing=missing.some(m=>/FaceDetailer|Ultralytics/.test(m));add('face','FaceDetailer',faceMissing?'unavailable':'ready',faceMissing?'Required face node or detector model is unavailable.':'FaceDetailer and configured detector are advertised.','Enable the documented face nodes/detector, or explicitly disable the face stage.');}
  }
 }
 if(!capabilities)add('checkpoint','Checkpoint / workflow models','unavailable','Model and node availability cannot be verified while ComfyUI discovery is unavailable.','Restore ComfyUI connectivity and Recheck.');
 for(const [id,name,used] of [['pose','OpenPose / ControlNet',usesPose],['face','FaceDetailer',usesFace],['adapter','IP-Adapter / CLIP Vision',usesRefs]] as const)if(used&&!items.some(i=>i.id===id))add(id,name,'unavailable','Required, but verification could not finish because workflow inputs or ComfyUI discovery failed.','Fix the blocking workflow/input or connectivity issue and Recheck.');
 add('refs','Reference inputs',usesPose||usesRefs?items.some(i=>i.id.startsWith('template-')&&i.status==='unavailable')?'unavailable':'ready':'not_required',usesPose||usesRefs?'Selected stored reference files are checked for existence and valid image content.':'This workflow does not request pose or product/style conditioning.');
 if(!usesPose)add('pose','OpenPose / ControlNet','not_required','Selected workflow does not use pose conditioning.');
 if(!usesFace)add('face','FaceDetailer','not_required','Selected workflow does not use the face detail stage.');
 if(!usesRefs)add('adapter','IP-Adapter / CLIP Vision','not_required','No product/style reference conditioning is used by this workflow.');
 add('runtime','Execution limits','warning','Discovery cannot verify GPU memory, checkpoint compatibility, OpenPose annotator weights, pose detection or successful execution. No image or paid model test was run.');
 if(provisional)add('planning','Workflow planning','warning','Final prompts are not yet fixed. Auto candidates are checked conservatively; readiness runs again on each actual image request.');
 return finish(provisional);
 function finish(provisional=false):ReadinessReport{return {checkedAt:new Date().toISOString(),canGenerate:!items.some(i=>i.severity==='blocking'),items,workflowModes:[...modes],provisional};}
}
export class ReadinessBlockedError extends Error {constructor(readonly readiness:ReadinessReport){super('Cannot start generation. '+readiness.items.filter(i=>i.severity==='blocking').map(i=>i.name+': '+i.explanation).join(' '));}}
export async function requireReadiness(options:ReadinessOptions){const report=await checkReadiness(options);if(!report.canGenerate)throw new ReadinessBlockedError(report);return report;}
