import {withReproducibility} from '@/lib/workflows/reproducibility';
import {randomUUID} from 'node:crypto';
import {withUsageScope} from '@/lib/usage/capture';
import type {ConditioningStrength} from '@/types/reference';
import {requireReadiness,ReadinessBlockedError,safeReadinessText} from '@/lib/readiness';
import {executionContext,executionCheckpoint,executionFence,JobCancelledError,JobLeaseLostError} from '@/lib/jobs/context';
import {controlledProviders} from '@/lib/jobs/control-providers';
import {guardBrand} from '@/lib/brand/conflicts';
import {saveBrandProfile} from '@/lib/brand/store';
import { refinementWorkflowPreference } from '@/lib/providers/image/sports';
import { refinementDecision } from './refinement-decision';
import type { GenerationContext } from '@/types/refinement';
import { saveEvaluation } from '@/lib/database/evaluations';
import { db } from '@/lib/database/client';
import { getCampaign } from '@/lib/database/campaigns';
import { getProviders, refinementConfig, type Providers } from '@/lib/providers';
import { analyseBrand, directCampaign, engineerPrompt, refinePrompt } from './creative';
import { assetSpecs, type Stage, type Brand, type Direction, type ImagePrompt, type CampaignView, type AssetView } from '@/types/campaign';

export class BusyError extends Error {}
export type WorkflowEvent = { stage: Stage; status: 'running' | 'completed' | 'failed'; message: string };
type Emit = (event: WorkflowEvent) => void | Promise<void>;

export async function withCampaignLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  await executionCheckpoint();
  const execution=executionContext.getStore();
  const lease = new Date();
  const acquired = await db.campaign.updateMany({ where: { id,activeJobId:execution?.jobId??null, OR: [{ lockAt: null }, { lockAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } }] }, data: { lockAt: lease } });
  if (!acquired.count) throw new BusyError('This campaign is already running. Wait for it to finish, then refresh.');
  try { return await withUsageScope({campaignId:id},work); }
  finally { await db.campaign.updateMany({ where: { id,...(execution?{activeJobId:execution.jobId,jobs:{some:{id:execution.jobId,attempt:execution.attempt}}}:{lockAt:lease}) }, data: { lockAt: null } }); }
}

async function stage<T>(id: string, name: Stage, emit: Emit, work: () => Promise<T>, message: string): Promise<T> {
  await executionCheckpoint();
  message=safeReadinessText(message,process.env);
  const run = await db.agentRun.create({ data: { campaignId: id, stage: name, status: 'running', message } });
  await emit({ stage: name, status: 'running', message });
  try {
    const result = await work();
    await executionFence();
    await db.agentRun.update({ where: { id: run.id }, data: { status: 'completed' } });
    await emit({ stage: name, status: 'completed', message });
    return result;
  } catch (error) {
    if(error instanceof JobLeaseLostError)throw error;
    const message = safeReadinessText(error instanceof Error ? error.message : 'Agent failed.',process.env);
    await db.agentRun.update({ where: { id: run.id }, data: { status: error instanceof JobCancelledError?'cancelled':'failed', message } });
    await emit({ stage: name, status: 'failed', message });
    throw error;
  }
}

async function produceAsset(c: CampaignView, asset: AssetView, brand: Brand, direction: Direction, providers: Providers, emit: Emit, human?: string, conditioningStrength?:ConditioningStrength, preflight=true) {
  const { max, threshold } = refinementConfig();
  let previous = asset.generations.at(-1);
  const execution=executionContext.getStore(),routing=execution?.routing?.find(r=>r.placement===asset.kind);
  const constraints=c.brandIntelligence?.approved??undefined;
  const retryingOwnOutput=!!execution&&previous?.jobId===execution.jobId&&previous.context?.brandConstraints?.revision===constraints?.revision;
  if(retryingOwnOutput&&['ready','approved','needs_review'].includes(asset.status))return;
  const resumable=retryingOwnOutput&&previous?.imageUrl?previous:undefined;
  let prompt: ImagePrompt = previous?.prompt ?? asset.prompt;
  if(constraints&&previous&&previous.context?.brandConstraints?.revision!==constraints.revision)prompt=await engineerPrompt(providers.llm,brand,direction,assetSpecs.find(s=>s.kind===asset.kind)!,constraints,c.creative);
  let reason = previous ? 'Human requested a new generation.' : 'Initial prompt from the campaign strategy.';
  let corrections: string[] = [];
  let qualityPreference: {reason:string;mode?:'quality'|'sports'} | undefined;
  if(retryingOwnOutput&&['quality','sports','sports_pose'].includes(previous?.context?.workflowMode||''))qualityPreference={mode:previous?.context?.workflowMode==='quality'?'quality':'sports',reason:previous?.context?.workflowReason||'Resume the saved workflow selection.'};
  const notify = (message:string) => stage(c.id,'Refinement',emit,async()=>{},message);
  const nextVersion = Math.max(0,...asset.generations.map(g=>g.version)) + 1;
  if (human&&!retryingOwnOutput) {
    if (!previous?.evaluation) throw new Error('Generate and review this asset before refining it.');
    const revised = await stage(c.id,'Refinement',emit,()=>withUsageScope({generationId:previous!.id,refinementIndex:0},()=>refinePrompt(providers.llm,prompt,previous!.evaluation!,{brandConstraints:constraints,placement:asset.kind,brand,direction,originalPrompt:asset.prompt,workflowMode:previous!.context?.workflowMode || 'unknown',generationId:previous!.id,version:previous!.version,humanDirection:human})),`Applying your creative direction. [LLM: ${providers.llm.name}]`);
    prompt = revised.prompt; corrections = revised.targetedCorrections; reason = `Human direction: ${human}`;
    qualityPreference = refinementWorkflowPreference(previous.evaluation,{prompt,direction});
  }
  await db.campaignAsset.update({where:{id:asset.id},data:{status:'generating',...providers.image.dimensions?.(asset.kind)}});
  const firstIteration=retryingOwnOutput?previous?.context?.refinementIndex??0:0;
  for (let iteration = firstIteration; iteration <= Math.max(firstIteration,max); iteration++) {
    await executionCheckpoint();
    await guardBrand(c.id,providers.llm,constraints,'prompt',prompt);
    const resume=iteration===firstIteration?resumable:undefined;
    const version = resume?.version??nextVersion+iteration-firstIteration-(resumable?1:0);
    const imageRequest = {forcedWorkflow:routing&&['basic','quality','sports','sports_pose'].includes(routing.providerMode)?routing.providerMode as 'basic'|'quality'|'sports'|'sports_pose':undefined,prompt,brand,direction,brandName:c.brandName,kind:asset.kind,width:asset.width,height:asset.height,version,references:routing?c.uploads.filter(u=>routing.referenceIds.includes(u.id)):c.uploads,qualityPreference,conditioningStrength};
    if(preflight)await requireReadiness({campaign:c,requests:[imageRequest]});
    let workflow = providers.image.workflow?.(imageRequest) ?? {mode:providers.image.name,reason:'Provider default'};
    let imageDescription = `${providers.image.name} / ${workflow.mode} — ${workflow.reason}`;
    const metadata: GenerationContext = resume?.context?{...resume.context}:{routing,brandConstraints:constraints,workflowMode:workflow.mode,workflowReason:workflow.reason,previousGenerationId:previous?.id || null,previousVersion:previous?.version ?? null,refinementIndex:iteration,targetedCorrections:corrections};
    const encode = () => JSON.stringify({...prompt,_generation:metadata});
    // Reserve a version before contacting the image provider, preserving failed attempts too.
    const generation = resume?await db.generation.findUniqueOrThrow({where:{id:resume.id}}):await db.generation.create({data:{assetId:asset.id,version,prompt:encode(),imageUrl:'',provider:providers.image.name,status:'generating',jobId:execution?.jobId,jobAttempt:execution?.attempt,reason:providers.image.describe ? `${reason} [Image: ${imageDescription}]` : reason}});
    let phase = 'image';
    try {
      if (!resume&&providers.image.resolveWorkflow) {
        workflow=await providers.image.resolveWorkflow(imageRequest);
        metadata.workflowMode=workflow.mode; metadata.workflowReason=workflow.reason;
        imageDescription=`${providers.image.name} / ${workflow.mode} — ${workflow.reason}`;
        await db.generation.update({where:{id:generation.id},data:{prompt:encode(),reason:reason+' [Image: '+imageDescription+']'}});
      }
      const result = resume?{imageUrl:resume.imageUrl,provider:resume.provider,reproducibility:resume.context?.reproducibility,detailPasses:resume.context?.detailPasses,referenceConditioning:resume.context?.referenceConditioning}:await stage(c.id,'Image Generation',emit,()=>withUsageScope({generationId:generation.id,refinementIndex:iteration},()=>withReproducibility(value=>{metadata.reproducibility=value;},()=>providers.image.generate(imageRequest))),`${asset.name} · version ${version} [Image: ${imageDescription}]`);
      const {detailPasses,referenceConditioning,reproducibility,...imageResult} = result;
      metadata.reproducibility=reproducibility??metadata.reproducibility;
      metadata.referenceConditioning=referenceConditioning;
      metadata.detailPasses = detailPasses;
      await db.generation.update({where:{id:generation.id},data:{...imageResult,prompt:encode(),status:'generated'}});
      for (const detail of !resume?detailPasses || []:[]) await stage(c.id,'Image Generation',emit,async()=>{},detail);
      if(!resume&&referenceConditioning) for(const ref of referenceConditioning.references) await stage(c.id,'Image Generation',emit,async()=>{},`Reference conditioning: ${ref.role} ${ref.id}; ${referenceConditioning.mode} / ${ref.weightType}; strength ${ref.strength}`);
      phase = 'vision';
      await executionCheckpoint();
      const evaluation = resume?.evaluation??await stage(c.id,'Vision Review',emit,async()=>{
        const evaluation = await withUsageScope({generationId:generation.id,refinementIndex:iteration},()=>providers.vision.evaluate({brandConstraints:constraints,imageUrl:result.imageUrl,prompt,brand,direction,iteration,objective:c.objective,placement:asset.kind,version}));
        await saveEvaluation(generation.id,providers.vision.name,evaluation);
        return evaluation;
      },`${iteration ? 'Vision re-evaluation' : 'Vision evaluation'}: ${asset.name} version ${version}. [Vision: ${providers.vision.name}]`);
      const decision = refinementDecision(evaluation,threshold,iteration,max);
      await db.generation.update({where:{id:generation.id},data:{status:'evaluated'}});
      if (!decision.refine) {
        metadata.stopReason = decision.reason;
        await db.generation.update({where:{id:generation.id},data:{prompt:encode()}});
        await db.campaignAsset.update({where:{id:asset.id},data:{status:decision.acceptable ? 'ready' : 'needs_review',prompt:JSON.stringify(prompt)}});
        await notify(decision.reason);
        return;
      }
      phase = 'refinement';
      await notify(decision.reason);
      const revised = await stage(c.id,'Refinement',emit,()=>withUsageScope({generationId:generation.id,refinementIndex:iteration+1},()=>refinePrompt(providers.llm,prompt,evaluation,{brandConstraints:constraints,placement:asset.kind,brand,direction,originalPrompt:asset.prompt,workflowMode:workflow.mode,generationId:generation.id,version})),`Prompt revision requested. [LLM: ${providers.llm.name}]`);
      await notify(`Prompt revised: ${revised.reason}`);
      previous = {...generation,imageUrl:result.imageUrl,prompt,evaluation,createdAt:generation.createdAt.toISOString(),context:metadata};
      prompt = revised.prompt; corrections = revised.targetedCorrections; reason = `${decision.reason} ${revised.reason}`;
      qualityPreference = refinementWorkflowPreference(evaluation,{prompt,direction}) ?? qualityPreference;
    } catch (error) {
      if(error instanceof JobCancelledError||error instanceof JobLeaseLostError)throw error;
      const message = safeReadinessText(error instanceof Error ? error.message : 'Provider failed.',process.env);
      metadata.stopReason = `Refinement stopped: ${phase === 'refinement' && /Invalid refinement|schema/i.test(message) ? 'invalid refinement output' : 'provider failure'} (${phase}).`;
      if (phase === 'refinement') metadata.refinementFailure = message; else metadata.error = message;
      await db.generation.update({where:{id:generation.id},data:{prompt:encode(),status:phase === 'image' ? 'image_failed' : phase === 'vision' ? 'evaluation_failed' : 'refinement_failed'}});
      await notify(metadata.stopReason);
      throw error;
    }
  }
}

export async function runCampaign(id: string, emit: Emit = () => {}, action?: { assetId: string; instruction?: string }, override?: Providers, conditioningStrength?:ConditioningStrength,prepareOnly=false) {
  return withCampaignLock(id, async () => {
    try {
      if(!override)await requireReadiness({routing:executionContext.getStore()?.routing,campaign:await getCampaign(id),assetId:action?.assetId,refine:!!action?.instruction,conditioningStrength});
      const providers = controlledProviders(override ?? getProviders());
      refinementConfig();
      await db.campaign.update({ where: { id }, data: { status: 'running', error: null } });
      let c = await getCampaign(id);
      if (!c) throw new Error('Campaign not found.');
      const route=executionContext.getStore()?.routing?.[0];
      const creative=route?{mode:route.creativeMode,override:route.override}:c.creative;
      c={...c,creative};
      const constraints=c.brandIntelligence?.approved??undefined;
      if(!prepareOnly&&constraints?.rules.length&&providers.vision.name==='mock')throw new Error('Approved brand rules require real Vision compliance evaluation. Configure VISION_PROVIDER=openai before generation.');
      if(c.brandIntelligence?.draft&&!constraints)throw new Error('Review and approve the Brand Intelligence draft before generation.');
      if(c.brandIntelligence?.conflicts.some(f=>f.status==='unresolved'))throw new Error('Resolve brand conflicts in Brand Intelligence before generation.');
      await guardBrand(id,providers.llm,constraints,'brief',{brief:c.brief,style:c.style,colours:c.colours,objective:c.objective});
      const changed=!!constraints&&c.constraintsRevision!==constraints.revision;
      let brand = c.brandProfile;
      if (!brand||changed) {
        brand = await stage(id, 'Brand Analysis', emit, () => analyseBrand(providers.llm, c!, c!.uploads.map(({ name, role, mime }) => ({ name, role, mime })),constraints), `Extracting personality, audience and brand constraints. [LLM: ${providers.llm.name}]`);
        await guardBrand(id,providers.llm,constraints,'direction',brand);
        await saveBrandProfile(id,brand);
      }
      let direction = c.direction;
      if (!direction||changed) {
        direction = await stage(id, 'Creative Direction', emit, () => directCampaign(providers.llm, c!, brand!,constraints), `Building the creative concept for the selected placements. [LLM: ${providers.llm.name}]`);
        await guardBrand(id,providers.llm,constraints,'direction',direction);
        await db.creativeDirection.upsert({ where: { campaignId: id }, create: { campaignId: id, data: JSON.stringify(direction) }, update: { data: JSON.stringify(direction) } });
      }
      await saveBrandProfile(id,brand,constraints?.revision);
      if (!action) await stage(id, 'Prompt Creation', emit, async () => {
        for (const spec of assetSpecs.filter(s=>!executionContext.getStore()?.routing||executionContext.getStore()!.routing!.some(r=>r.placement===s.kind))) {
          const existing=c!.assets.find(a=>a.kind===spec.kind);
          if(existing&&(!changed||existing.generations.length))continue;
          const usageAssetId=existing?.id??randomUUID();
          const prompt = await withUsageScope({assetId:usageAssetId},()=>engineerPrompt(providers.llm, brand!, direction!, spec,constraints,c!.creative));
          if(existing){await db.campaignAsset.update({where:{id:existing.id},data:{prompt:JSON.stringify(prompt)}});continue;}
          await db.campaignAsset.create({ data: { id:usageAssetId,campaignId: id, kind: spec.kind, name: spec.name, width: spec.width, height: spec.height, ...providers.image.dimensions?.(spec.kind), prompt: JSON.stringify(prompt) } });
        }
      }, `Writing format-specific production prompts. [LLM: ${providers.llm.name}]`);
      if(prepareOnly)return;
      c = {...(await getCampaign(id))!,creative};
      const assets = action ? c.assets.filter(a => a.id === action.assetId) : c.assets.filter(a => !['ready', 'approved', 'needs_review'].includes(a.status));
      if (action && !assets.length) throw new Error('Asset does not belong to this campaign.');
      for (const asset of assets) await withUsageScope({assetId:asset.id},()=>produceAsset(c!, asset, brand!, direction!, providers, emit, action?.instruction, conditioningStrength,!override));
      await stage(id, 'Completed', emit, async () => {
        await db.campaign.update({ where: { id }, data: { status: 'completed' } });
      }, 'Campaign assets are ready for your review.');
    } catch (error) {
      if(error instanceof JobLeaseLostError)throw error;
      if(error instanceof JobCancelledError){await db.campaign.updateMany({where:{id,status:'running'},data:{status:'cancelled',error:null}});await db.campaignAsset.updateMany({where:{campaignId:id,status:'generating'},data:{status:'pending'}});throw error;}
      if(error instanceof ReadinessBlockedError){await db.campaignAsset.updateMany({where:{campaignId:id,status:'generating'},data:{status:'pending'}});await db.campaign.updateMany({where:{id,status:'running'},data:{status:'failed',error:error.message}});throw error;}
      await db.campaign.update({ where: { id }, data: { status: 'failed', error: safeReadinessText(error instanceof Error ? error.message : 'Workflow failed.',process.env) } });
      await db.campaignAsset.updateMany({ where: { campaignId: id, status: 'generating' }, data: { status: 'failed' } });
      throw error;
    }
  });
}
