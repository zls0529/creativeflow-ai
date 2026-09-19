import {generateCommercialPoster} from '@/lib/commercial-poster/pipeline';
import {generateProductHero} from '@/lib/product-hero/pipeline';
import {recordReproducibility} from '@/lib/workflows/reproducibility';
import type {Catalog} from '@/lib/workflows/dependencies';
import {comfyRepair,type ProviderRepairRequest} from './repair';
import {measure,captureLocal} from '@/lib/usage/capture';
import {loadReferences} from './references';
import {applyReferenceWorkflow,referenceDependencies,defaultAdapter,defaultEncoder} from './reference-workflow';
import 'server-only';
import sharp from 'sharp';
import { validateDetectedPose, poseReference, loadPoseReference, poseDependencyError, openPoseModel } from './pose';
import { sportsPrompts } from './sports';
import { readFile } from 'node:fs/promises';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { selectWorkflow, qualityPrompts, qualityBaseSizes, type WorkflowMode } from './quality';
import { storage, detectMime } from '@/lib/storage';
import type { AssetKind } from '@/types/campaign';
import type { ImageGenerationProvider, ImageRequest, ImageResult } from './base';

export const comfySizes = { hero: { width: 1024, height: 768 }, post: { width: 1024, height: 1024 }, story: { width: 768, height: 1344 }, banner: { width: 1536, height: 512 }, product: { width: 1024, height: 1024 } } satisfies Record<AssetKind, { width: number; height: number }>;
const graphSchema = z.record(z.object({ class_type: z.string(), inputs: z.record(z.unknown()) }));
type Graph = z.infer<typeof graphSchema>;
const types: Record<string, string> = { '3': 'KSampler', '4': 'CheckpointLoaderSimple', '5': 'EmptyLatentImage', '6': 'CLIPTextEncode', '7': 'CLIPTextEncode', '8': 'VAEDecode', '9': 'SaveImage' };
const slots: Record<string, [string, string]> = { checkpoint: ['4','ckpt_name'], positive: ['6','text'], negative: ['7','text'], width: ['5','width'], height: ['5','height'], seed: ['3','seed'], steps: ['3','steps'], cfg: ['3','cfg'], sampler: ['3','sampler_name'], scheduler: ['3','scheduler'] };
export function fillWorkflow(template: unknown, values: Record<string, string | number>, mode: 'basic' | 'quality' | 'sports' | 'sports_pose' = 'basic', faceDetail = true): Graph {
  const parsed = graphSchema.safeParse(template);
  if (!parsed.success) throw new Error(`Invalid ComfyUI workflow template (${mode}). Restore the selected repository template. No fallback was attempted.`);
  const graph = parsed.data;
  if (mode === 'sports_pose') {
    const invalid = () => { throw new Error('Invalid sports_pose workflow template. Restore sports_pose_api.json; no downgrade attempted.'); };
    if (Object.keys(graph).length !== 19) invalid();
    const expected = {'30':'LoadImage','31':'OpenposePreprocessor','32':'ControlNetLoader','33':'ControlNetApplyAdvanced'};
    for (const [id,type] of Object.entries(expected)) if (graph[id]?.class_type !== type) invalid();
    for (const [id,key,value] of [['30','image','{{pose_image}}'],['31','image',['30',0]],['31','detect_body','enable'],['31','detect_face','disable'],['31','detect_hand','disable'],['32','control_net_name','{{openpose_model}}'],['33','positive',['6',0]],['33','negative',['7',0]],['33','image',['31',0]],['33','control_net',['32',0]],['33','strength','{{pose_strength}}'],['33','start_percent','{{pose_start}}'],['33','end_percent','{{pose_end}}'],['3','positive',['33',0]],['3','negative',['33',1]]] as const) if (JSON.stringify(graph[id].inputs[key]) !== JSON.stringify(value)) invalid();
    const extras: Graph = {};
    for (const id of Object.keys(expected)) { extras[id]=graph[id]; delete graph[id]; }
    graph['3'].inputs.positive=['6',0]; graph['3'].inputs.negative=['7',0];
    const base=fillWorkflow(graph,values,'sports',faceDetail);
    for (const node of Object.values(extras)) for (const [key,value] of Object.entries(node.inputs)) if (typeof value === 'string' && /^{{.+}}$/.test(value)) {
      const slot=value.slice(2,-2); if (values[slot] === undefined) invalid(); node.inputs[key]=values[slot];
    }
    base['3'].inputs.positive=['33',0]; base['3'].inputs.negative=['33',1];
    return {...base,...extras};
  }
  if (mode === 'sports') {
    const invalid = () => { throw new Error('Invalid sports workflow template. Restore sports_api.json; no downgrade attempted.'); };
    if (Object.keys(graph).length !== 15 || graph['20']?.class_type !== 'UltralyticsDetectorProvider' || graph['21']?.class_type !== 'FaceDetailer' || graph['22']?.class_type !== 'CLIPTextEncode' || graph['24']?.class_type !== 'SaveImage') invalid();
    for (const [id,key,value] of [['9','images',['21',0]],['20','model_name','{{face_detector}}'],['21','image',['8',0]],['21','model',['4',0]],['21','clip',['4',1]],['21','vae',['4',2]],['21','positive',['22',0]],['21','negative',['7',0]],['21','bbox_detector',['20',0]],['22','clip',['4',1]],['24','images',['8',0]]] as const) if (JSON.stringify(graph[id].inputs[key]) !== JSON.stringify(value)) invalid();
    const extras: Graph = {};
    for (const id of ['20','21','22','24']) { extras[id]=graph[id]; delete graph[id]; }
    graph['9'].inputs.images=['8',0];
    const base=fillWorkflow(graph,values,'quality');
    for (const node of Object.values(extras)) for (const [key,value] of Object.entries(node.inputs)) if (typeof value === 'string' && /^{{.+}}$/.test(value)) {
      const slot=value.slice(2,-2); if (values[slot] === undefined) invalid(); node.inputs[key]=values[slot];
    }
    if (!faceDetail) return base;
    base['9'].inputs.images=['21',0]; return {...base,...extras};
  }
  const quality = mode === 'quality';
  const expectedTypes = quality ? { ...types, '10': 'ImageScale', '11': 'KSampler', '12': 'VAEDecode', '13': 'VAEEncode' } : types;
  const expectedSlots = quality ? { ...slots, width: ['10','width'], height: ['10','height'], base_width: ['5','width'], base_height: ['5','height'], refine_steps: ['11','steps'], denoise: ['11','denoise'] } : slots;
  const invalid = () => { throw new Error(`Invalid ComfyUI workflow template (${mode}). Restore the selected repository template. No fallback was attempted.`); };
  if (Object.keys(graph).length !== (quality ? 11 : 7) || Object.entries(expectedTypes).some(([id, type]) => graph[id]?.class_type !== type)) invalid();
  for (const [slot, [id, key]] of Object.entries(expectedSlots)) {
    if (graph[id].inputs[key] !== `{{${slot}}}` || values[slot] === undefined) invalid();
    graph[id].inputs[key] = values[slot];
  }
  for (const [id, key, link] of [['3','model',['4',0]], ['3','positive',['6',0]], ['3','negative',['7',0]], ['3','latent_image',['5',0]], ['6','clip',['4',1]], ['7','clip',['4',1]], ['8','samples',['3',0]], ['8','vae',['4',2]], ['9','images',['8',0]]] as const) {
    if (JSON.stringify(graph[id].inputs[key]) !== JSON.stringify(quality && id === '8' && key === 'samples' ? ['11',0] : link)) invalid();
  }
  if (graph['5'].inputs.batch_size !== 1 || graph['3'].inputs.denoise !== 1) invalid();
  if (quality) {
    const second = graph['11'].inputs;
    for (const key of ['seed','cfg','sampler_name','scheduler']) {
      const slot = key === 'sampler_name' ? 'sampler' : key;
      if (second[key] !== `{{${slot}}}`) invalid();
      second[key] = values[slot];
    }
    for (const [key, value] of Object.entries({ model:['4',0],positive:['6',0],negative:['7',0],latent_image:['13',0] })) if (JSON.stringify(second[key]) !== JSON.stringify(value)) invalid();
    if (JSON.stringify(graph['10'].inputs.image) !== JSON.stringify(['12',0]) || graph['10'].inputs.crop !== 'disabled' || graph['10'].inputs.upscale_method !== 'bicubic') invalid();
  }
  if (quality) for (const [id,key,value] of [['12','samples',['3',0]],['12','vae',['4',2]],['13','pixels',['10',0]],['13','vae',['4',2]]] as const) if (JSON.stringify(graph[id].inputs[key]) !== JSON.stringify(value)) invalid();
  return graph;
}
function numeric(env: Record<string, string | undefined>, key: string, fallback: number, min: number, max: number, integer = true) {
  const value = Number(env[key] || fallback);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${key} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return value;
}
export class ComfyUIProvider implements ImageGenerationProvider {
  readonly name = 'comfyui';
  private readonly repairEnv:Record<string,string|undefined>;
  repair(request:ProviderRepairRequest){return comfyRepair(request,this.repairEnv);}
  private readonly url: URL;
  private readonly checkpoint: string;
  private readonly adapter: string;
  private readonly encoder: string;
  private readonly settings;
  private readonly qualitySettings;
  private readonly sportsSettings;
  private readonly faceDetail: boolean;
  private readonly mode: WorkflowMode;
  private readonly poseSettings;
  private readonly resolved = new WeakMap<ImageRequest, {mode:'sports_pose';reason:string;pose:{id:string;bytes:Buffer}}>();
  private readonly seed: number | undefined;
  constructor(env: Record<string, string | undefined> = process.env) {
    this.repairEnv={...env};
    if (!env.COMFYUI_URL?.trim()) throw new Error('Missing COMFYUI_URL. Set it to your local ComfyUI server, e.g. http://127.0.0.1:8188.');
    try { this.url = new URL(env.COMFYUI_URL); if (!['http:', 'https:'].includes(this.url.protocol) || this.url.username || this.url.password || this.url.search || this.url.hash) throw new Error(); } catch { throw new Error('COMFYUI_URL must be an HTTP or HTTPS URL without credentials, query or fragment.'); }
    this.checkpoint = env.COMFYUI_CHECKPOINT_NAME?.trim() || '';
    if (!this.checkpoint) throw new Error('Missing COMFYUI_CHECKPOINT_NAME. Use an installed checkpoint filename from ComfyUI.');
    const mode = env.COMFYUI_WORKFLOW_MODE || 'basic';
    if (!['basic','quality','sports','sports_pose','auto'].includes(mode)) throw new Error('COMFYUI_WORKFLOW_MODE must be basic, quality, sports, sports_pose or auto.');
    this.mode = mode as WorkflowMode;
    this.adapter=env.COMFYUI_IPADAPTER_MODEL || defaultAdapter;
    this.encoder=env.COMFYUI_CLIP_VISION_MODEL || defaultEncoder;
    const model = env.COMFYUI_OPENPOSE_MODEL?.trim() || openPoseModel;
    if (!/^control_v11p_sd15_openpose(?:_fp16)?\.safetensors$/.test(model)) throw new Error('COMFYUI_OPENPOSE_MODEL must name the documented SD1.5 OpenPose safetensors model; SDXL/FLUX models are incompatible.');
    this.poseSettings = {openpose_model:model,pose_strength:numeric(env,'COMFYUI_POSE_STRENGTH',0.8,0.1,1.5,false),pose_start:numeric(env,'COMFYUI_POSE_START_PERCENT',0,0,1,false),pose_end:numeric(env,'COMFYUI_POSE_END_PERCENT',0.85,0,1,false)};
    if (this.poseSettings.pose_start >= this.poseSettings.pose_end) throw new Error('COMFYUI_POSE_START_PERCENT must be less than COMFYUI_POSE_END_PERCENT.');
    this.seed = env.COMFYUI_SEED ? numeric(env,'COMFYUI_SEED',0,0,2 ** 32 - 1) : undefined;
    this.qualitySettings = { steps: numeric(env,'COMFYUI_QUALITY_STEPS',28,1,100), cfg: numeric(env,'COMFYUI_QUALITY_CFG',6,0,30,false), sampler: env.COMFYUI_QUALITY_SAMPLER || 'dpmpp_2m', scheduler: env.COMFYUI_QUALITY_SCHEDULER || 'karras', refine_steps: numeric(env,'COMFYUI_REFINE_STEPS',16,1,60), denoise: numeric(env,'COMFYUI_REFINE_DENOISE',0.25,0.05,0.4,false) };
    if (env.COMFYUI_SPORTS_FACE_DETAIL && !['true','false'].includes(env.COMFYUI_SPORTS_FACE_DETAIL)) throw new Error('COMFYUI_SPORTS_FACE_DETAIL must be true or false.');
    this.faceDetail = env.COMFYUI_SPORTS_FACE_DETAIL !== 'false';
    this.sportsSettings = { steps:numeric(env,'COMFYUI_SPORTS_STEPS',32,1,100),cfg:numeric(env,'COMFYUI_SPORTS_CFG',5.5,0,30,false),sampler:env.COMFYUI_SPORTS_SAMPLER || 'dpmpp_2m',scheduler:env.COMFYUI_SPORTS_SCHEDULER || 'karras',refine_steps:numeric(env,'COMFYUI_SPORTS_REFINE_STEPS',18,1,60),denoise:numeric(env,'COMFYUI_SPORTS_REFINE_DENOISE',0.22,0.05,0.4,false),face_detector:env.COMFYUI_SPORTS_FACE_DETECTOR || 'bbox/face_yolov8m.pt',face_steps:numeric(env,'COMFYUI_SPORTS_FACE_STEPS',16,1,40),face_denoise:numeric(env,'COMFYUI_SPORTS_FACE_DENOISE',0.22,0.05,0.4,false) };
    this.settings = { steps: numeric(env,'COMFYUI_STEPS',20,1,100), cfg: numeric(env,'COMFYUI_CFG',7,0,30,false), sampler: env.COMFYUI_SAMPLER || 'euler', scheduler: env.COMFYUI_SCHEDULER || 'normal', timeout: numeric(env,'COMFYUI_TIMEOUT_MS',300000,1000,600000) };
  }
  dimensions(kind: AssetKind) { return comfySizes[kind]; }
  readinessRequirements(request:ImageRequest, explicitMode?:'basic'|'quality'|'sports'|'sports_pose') {
    let mode=explicitMode??this.workflow(request).mode;
    if(!request.forcedWorkflow&&mode==='sports'&&(this.mode==='auto'||request.qualityPreference?.mode==='sports')&&(request.references||[]).some(r=>r.role==='pose'))mode='sports_pose';
    return {mode,pose:mode==='sports_pose',face:(mode==='sports'||mode==='sports_pose')&&this.faceDetail,references:!!(request.productReference||request.styleReference||(request.references||[]).some(r=>['product','style','reference'].includes(r.role)))};
  }
  /** Read-only dependency preview. Never uploads, queues, detects pose or runs a sampler. */
  async readinessPlan(request:ImageRequest, explicitMode?:'basic'|'quality'|'sports'|'sports_pose') {
    const {mode}=this.readinessRequirements(request,explicitMode);
    if(mode==='sports_pose')await loadPoseReference(request);
    const refs=await loadReferences(request);
    if(refs.length&&this.adapter!==defaultAdapter)throw new Error('Reference conditioning requires ip-adapter-plus_sd15.safetensors for the current SD1.5 workflow.');
    const file=mode==='sports_pose'?'sports_pose_api.json':mode==='sports'?'sports_api.json':mode==='quality'?'human_quality_api.json':'basic_text2img_api.json';
    let template:unknown;
    try{template=JSON.parse(await readFile(path.join(process.cwd(),'comfyui/workflows',file),'utf8'));}catch{throw new Error('Required workflow template is missing or unreadable: '+file);}
    const settings=mode==='sports'||mode==='sports_pose'?this.sportsSettings:mode==='quality'?this.qualitySettings:this.settings;
    const base=qualityBaseSizes[request.kind];
    let graph=fillWorkflow(template,{checkpoint:this.checkpoint,positive:'Readiness only',negative:'',...this.dimensions(request.kind),base_width:base.width,base_height:base.height,seed:0,...settings,...this.poseSettings,pose_image:'pending.png'},mode,this.faceDetail);
    if(refs.length){let extension:unknown;try{extension=JSON.parse(await readFile(path.join(process.cwd(),'comfyui/workflows/reference_conditioning_api.json'),'utf8'));}catch{throw new Error('Required reference conditioning template is missing or unreadable.');}graph=applyReferenceWorkflow(graph,extension,refs.map(r=>({...r,image:'pending.png'})),this.adapter,this.encoder);}
    return {mode,graph,checkpoint:this.checkpoint,face:!!graph['21'],pose:mode==='sports_pose',references:refs.length>0,adapter:this.adapter,encoder:this.encoder,poseModel:this.poseSettings.openpose_model};
  }
  workflow(request: ImageRequest) { if(request.forcedWorkflow)return {mode:request.forcedWorkflow,reason:'Frozen Creative Mode routing'};return this.resolved.get(request) ?? (this.mode === 'sports_pose' ? {mode:'sports_pose' as const,reason:'Explicit sports_pose mode'} : request.qualityPreference ? { mode:request.qualityPreference.mode || 'quality' as const,reason:request.qualityPreference.reason } : selectWorkflow(this.mode,request)); }
  async resolveWorkflow(request: ImageRequest) {
    if(request.commercialPoster)return {mode:'commercial_poster_v1' as const,reason:'Explicit experimental Klein workflow'};
    const cached=this.resolved.get(request); if (cached) return cached;
    const candidate=this.workflow(request);
    if(request.forcedWorkflow&&request.forcedWorkflow!=='sports_pose')return candidate;
    if (candidate.mode !== 'sports_pose' && !(candidate.mode === 'sports' && (this.mode === 'auto' || request.qualityPreference?.mode === 'sports'))) return candidate;
    const ref=poseReference(request);
    if (!ref && candidate.mode !== 'sports_pose') return {...candidate,reason:candidate.reason + '; no pose reference, using sports'};
    const pose=await loadPoseReference(request);
    let capabilities;
    try {
      const response=await fetch(new URL(this.url.pathname.replace(/\/$/,'')+'/object_info',this.url),{signal:AbortSignal.timeout(15000),redirect:'error'});
      if (!response.ok) throw new Error(); capabilities=await response.json();
    } catch { throw new Error('ComfyUI pose dependency check failed: server unreachable or invalid response. No generation queued.'); }
    const missing=poseDependencyError(capabilities,this.poseSettings.openpose_model);
    if (missing) throw new Error('sports_pose unavailable: '+missing+'. No downgrade attempted. Remove the pose reference or explicitly select sports to proceed without pose conditioning.');
    const result={mode:'sports_pose' as const,reason:(candidate.mode === 'sports_pose' ? 'Explicit sports_pose' : candidate.reason + '; selected sports_pose')+': valid stored pose reference and advertised OpenPose dependencies verified',pose};
    this.resolved.set(request,result); return result;
  }
  describe(request: ImageRequest) { const selected = this.workflow(request); return `comfyui / ${selected.mode} — ${selected.reason}`; }
  async generate(request: ImageRequest): Promise<ImageResult> {
    if(request.commercialPoster)return generateCommercialPoster(request,this.repairEnv);
    if(request.productHero)return generateProductHero(request,this.repairEnv,request.onStage);
    return measure('comfyui','image',request.version>1?'comfyui_refinement':'comfyui_generation',this.checkpoint,()=>this.generateMeasured(request));
  }
  private async generateMeasured(request: ImageRequest): Promise<ImageResult> {
    captureLocal({checkpoint:this.checkpoint,...this.dimensions(request.kind)});
    const selected = await this.resolveWorkflow(request);
    if(selected.mode==='commercial_poster_v1')throw new Error('Commercial Poster must use its explicit provider branch.');
    captureLocal({workflow:selected.mode,plannedRefinementPasses:selected.mode==='basic'?0:1});
    const references = await loadReferences(request);
    if(references.length && this.adapter !== defaultAdapter)throw new Error('Reference conditioning requires ip-adapter-plus_sd15.safetensors for the current SD1.5 workflow.');
    const sports = selected.mode === 'sports' || selected.mode === 'sports_pose';
    const templateFile = selected.mode === 'sports_pose' ? 'sports_pose_api.json' : selected.mode === 'sports' ? 'sports_api.json' : selected.mode === 'quality' ? 'human_quality_api.json' : 'basic_text2img_api.json';
    let template: unknown;
    try { template = JSON.parse(await readFile(path.join(process.cwd(),'comfyui/workflows',templateFile),'utf8')); } catch { throw new Error(`Invalid or missing ComfyUI workflow template: ${templateFile}. No fallback was attempted.`); }
    const { negative_prompt, ...positive } = request.prompt;
    const size = this.dimensions(request.kind);
    const prompts = sports ? sportsPrompts(request) : selected.mode === 'quality' ? qualityPrompts(request) : { positive: Object.entries(positive).map(([key,value]) => `${key.replaceAll('_',' ')}: ${value}`).join('\n'), negative: negative_prompt };
    if(references.some(r=>r.role==='product')) prompts.positive='Preserve the reference product silhouette, proportions, sole profile, upper construction, materials and color blocking. Apply campaign colors to the surroundings rather than recoloring the product. '+prompts.positive;
    if(references.some(r=>r.role==='style')) prompts.positive='Use the style reference for palette, lighting and texture only; retain the prompted subject and product reference identity. '+prompts.positive;
    const settings = sports ? this.sportsSettings : selected.mode === 'quality' ? this.qualitySettings : this.settings;
    const base = qualityBaseSizes[request.kind];
    let graph = fillWorkflow(template, { checkpoint: this.checkpoint, ...prompts, ...size, base_width: base.width, base_height: base.height, seed: this.seed ?? randomInt(0, 2 ** 32), ...settings, ...this.poseSettings, pose_image:'pending.png' }, selected.mode, this.faceDetail);
    const signal = AbortSignal.timeout(this.settings.timeout);
    const fetchLocal = async (endpoint: string, init?: RequestInit) => {
      try { return await fetch(new URL(`${this.url.pathname.replace(/\/$/,'')}/${endpoint}`, this.url), { ...init, redirect: 'error', signal }); }
      catch { if (signal.aborted) throw new Error('ComfyUI generation timeout. The queued job may still finish in ComfyUI; check its queue before retrying.'); throw new Error('ComfyUI unreachable. Check COMFYUI_URL and that the local server is running.'); }
    };
    const json = async (endpoint: string, init?: RequestInit) => {
      const response = await fetchLocal(endpoint, init);
      if (!response.ok) throw new Error(`ComfyUI rejected the workflow request (HTTP ${response.status}). Check the checkpoint, sampler and server console.`);
      try { return await response.json(); } catch { throw new Error(signal.aborted ? 'ComfyUI generation timeout.' : 'Invalid ComfyUI workflow response: expected JSON.'); }
    };
    let dependencyCatalog:Catalog|undefined,referenceTemplate:unknown;
    if(references.length){
      const capabilities=await json('object_info');
      dependencyCatalog=capabilities;
      referenceDependencies(capabilities,this.adapter,this.encoder);
      let extension:unknown;
      try{extension=JSON.parse(await readFile(path.join(process.cwd(),'comfyui/workflows/reference_conditioning_api.json'),'utf8'));}catch{throw new Error('Invalid or missing reference conditioning template. No fallback attempted.');}
      referenceTemplate=extension;
      // Validate the graph before uploading any reference bytes.
      applyReferenceWorkflow(graph,extension,references.map(r=>({...r,image:'pending.png'})),this.adapter,this.encoder);
      const uploadedReferences=[];
      for(const ref of references){
        const form=new FormData();form.append('image',new Blob([new Uint8Array(ref.bytes)],{type:'image/png'}),'creativeflow-reference-'+randomUUID()+'.png');form.append('type','input');form.append('overwrite','false');
        const uploaded=z.object({name:z.string().regex(/^[a-zA-Z0-9-]+\.png$/),subfolder:z.literal(''),type:z.literal('input')}).safeParse(await json('upload/image',{method:'POST',body:form}));
        if(!uploaded.success)throw new Error('Invalid ComfyUI reference upload response. No generation queued.');
        uploadedReferences.push({...ref,image:uploaded.data.name});
      }
      graph=applyReferenceWorkflow(graph,extension,uploadedReferences,this.adapter,this.encoder);
    }
    if (selected.mode === 'sports_pose') {
      const pose=this.resolved.get(request)?.pose;
      if (!pose) throw new Error('Pose reference was not validated. No generation queued.');
      const framed=await sharp(pose.bytes).resize(base.width,base.height,{fit:'contain',background:'#000000'}).png().toBuffer();
      const form=new FormData(); form.append('image',new Blob([new Uint8Array(framed)],{type:'image/png'}),'creativeflow-pose-'+randomUUID()+'.png'); form.append('type','input'); form.append('overwrite','false');
      const uploaded=z.object({name:z.string().regex(/^[a-zA-Z0-9-]+\.png$/),subfolder:z.literal(''),type:z.literal('input')}).safeParse(await json('upload/image',{method:'POST',body:form}));
      if (!uploaded.success) throw new Error('Invalid ComfyUI pose upload response. No generation queued.');
      graph['30'].inputs.image=uploaded.data.name;
    }
    if (sports || references.length) {
      const capabilities = await json('object_info');
      dependencyCatalog=capabilities;
      for (const node of Object.values(graph)) {
        const info = capabilities?.[node.class_type];
        if (!info?.input?.required) throw new Error(`Sports workflow unavailable: missing node ${node.class_type}. Install the documented nodes or explicitly disable the face stage; no downgrade attempted.`);
        for (const [key,value] of Object.entries(node.inputs)) {
          const choices=(info.input.required[key] || info.input.optional?.[key])?.[0];
          if (Array.isArray(choices) && typeof value === 'string' && !choices.includes(value)) throw new Error(`Sports workflow unavailable: configured ${key} is not installed/supported. Check the checkpoint, detector or sampler settings; no downgrade attempted.`);
        }
      }
    }
    const usedPose=this.resolved.get(request)?.pose;
    const reproducibility=recordReproducibility({mode:selected.mode,template,extension:referenceTemplate,graph,...size,catalog:dependencyCatalog,pose:usedPose?{id:usedPose.id,sha256:createHash('sha256').update(usedPose.bytes).digest('hex')}:undefined,references:references.map(({id,role,strength,weightType,sha256})=>({id,role,strength,weightType,sha256}))});
    const queued = z.object({ prompt_id: z.string().regex(/^[a-zA-Z0-9-]+$/), node_errors: z.record(z.unknown()).optional() }).safeParse(await json('prompt', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ prompt: graph, client_id: randomUUID() }) }));
    if (!queued.success || Object.keys(queued.data.node_errors || {}).length) throw new Error('Invalid ComfyUI workflow response: missing job ID or rejected nodes. Check the installed checkpoint and workflow.');
    const id = queued.data.prompt_id;
    const historySchema = z.record(z.object({ status: z.object({ status_str: z.enum(['success','error']), completed: z.boolean() }), outputs: z.record(z.unknown()) }));
    let output: { filename: string; subfolder: string; type: 'output' } | undefined;
    let beforeFace: typeof output;
    while (!output) {
      const history = historySchema.safeParse(await json(`history/${id}`));
      if (!history.success) throw new Error('Invalid ComfyUI workflow response: malformed job history.');
      const job = history.data[id];
      if (job?.status.status_str === 'error') throw new Error(selected.mode === 'sports_pose' ? 'ComfyUI sports_pose generation failed. Check OpenPose annotator weights, SD1.5 ControlNet compatibility and GPU memory in the server console. No downgrade attempted.' : 'ComfyUI generation failed. Check the ComfyUI console for checkpoint compatibility or GPU memory errors.');
      if (job?.status.completed) {
        if (selected.mode === 'sports_pose') validateDetectedPose(job.outputs['31']);
        const saved = z.object({ images: z.array(z.object({ filename: z.string().min(1), subfolder: z.string(), type: z.literal('output') })).min(1) }).safeParse(job.outputs['9']);
        if (!saved.success) throw new Error('ComfyUI completed without a valid image output from SaveImage.');
        output = saved.data.images[0];
        if (sports && this.faceDetail) {
          const prior=z.object({images:z.array(z.object({filename:z.string().min(1),subfolder:z.string(),type:z.literal('output')})).min(1)}).safeParse(job.outputs['24']);
          if (!prior.success) throw new Error('Sports face stage has no verification output; no detail-pass claim was recorded.');
          beforeFace=prior.data.images[0];
        }
        if (/[\\/\x00]/.test(output.filename) || output.filename === '..' || output.subfolder.split(/[\\/]/).some(p => p === '..') || /[:\x00]/.test(output.subfolder) || /^[\\/]/.test(output.subfolder)) throw new Error('Invalid ComfyUI workflow response: unsafe image path.');
        break;
      }
      try { await delay(1000, undefined, { signal }); } catch { throw new Error('ComfyUI generation timeout. The queued job may still finish in ComfyUI; check its queue before retrying.'); }
    }
    const retrieve = async (output: {filename:string;subfolder:string;type:'output'}) => {
      if (/[\\/\x00]/.test(output.filename) || output.subfolder.split(/[\\/]/).includes('..') || /[:\x00]/.test(output.subfolder) || /^[\\/]/.test(output.subfolder)) throw new Error('Invalid ComfyUI image path.');
      const response = await fetchLocal(`view?${new URLSearchParams(output)}`);
    if (!response.ok || !response.body) throw new Error('ComfyUI image output could not be retrieved.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > 32 * 1024 * 1024) { await reader.cancel(); throw new Error('ComfyUI image output exceeds the 32 MB limit.'); } chunks.push(value); }
    } catch (error) { if (signal.aborted) throw new Error('ComfyUI generation timeout while retrieving the image.'); throw error; }
    const bytes = Buffer.concat(chunks);
    if (detectMime(bytes) !== 'image/png' || bytes.length < 33 || bytes.toString('ascii',12,16) !== 'IHDR' || bytes.readUInt32BE(16) !== size.width || bytes.readUInt32BE(20) !== size.height) throw new Error('Invalid ComfyUI image output: expected a PNG with the requested dimensions.');

      return bytes;
    };
    const bytes = await retrieve(output);
    const detailPasses: string[] = [];
    if (sports) {
      if (this.faceDetail && beforeFace) {
        const previous = await retrieve(beforeFace);
        const [a,b] = await Promise.all([sharp(previous).raw().toBuffer(),sharp(bytes).raw().toBuffer()]);
        detailPasses.push(a.equals(b) ? 'Face detail stage completed without changed pixels; detector may have found no face.' : 'Detail pass applied: face');
      } else detailPasses.push('Face detail stage explicitly disabled in configuration.');
      detailPasses.push('No local shoe detail pass: no dedicated shoe detector configured.');
    }
    if (selected.mode === 'sports_pose') detailPasses.unshift('Pose conditioning applied: OpenPose body only; model '+this.poseSettings.openpose_model+'; strength '+this.poseSettings.pose_strength+'; start '+this.poseSettings.pose_start+'; end '+this.poseSettings.pose_end+'; pose reference '+poseReference(request)!.id);
    captureLocal({detailPasses,completedRefinementPasses:selected.mode==='basic'?0:1});
    const file = `${randomUUID()}.png`;
    await storage.putGenerated(file, bytes);
    const referenceConditioning = references.length ? {mode:'ip-adapter' as const,model:this.adapter,encoder:this.encoder,references:references.map(({id,role,strength,weightType,sha256})=>({id,role,strength,weightType,sha256}))} : undefined;
    return { reproducibility, imageUrl: `/api/generated/${file}`,  provider: this.name, ...(referenceConditioning?{referenceConditioning}:{}), ...(detailPasses.length ? {detailPasses} : {}) };
  }
}
