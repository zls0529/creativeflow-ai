import 'server-only';
import {readFile,readdir} from 'node:fs/promises';
import data from '@/comfyui/registry.json';
import {workflowDefinitionSchema,type WorkflowDefinition} from '@/types/workflow';
import {templateHash} from './hash';

export function validateRegistry(value:unknown):WorkflowDefinition[]{
 const entries=workflowDefinitionSchema.array().parse(value),keys=new Set<string>();
 for(const item of entries){const key=item.id+'@'+item.version;if(keys.has(key))throw new Error('Duplicate workflow ID/version: '+key);keys.add(key);}
 return entries;
}
export const registry=validateRegistry(data);
export function getWorkflow(id:string,version:string){const w=registry.find(w=>w.id===id&&w.version===version);if(!w)throw new Error('Workflow ID/version is not registered.');return w;}
export const legacyWorkflowIds:Record<string,string>={commercial_poster_v1:'commercial_poster_v1',product_hero_v1:'product_hero_v1',basic:'legacy_basic_v1',quality:'legacy_quality_v1',sports:'legacy_sports_v1',sports_pose:'legacy_sports_pose_v1',inpaint_repair:'repair_v1',face_repair:'repair_face_v1'};
export function workflowForMode(mode:string){const id=legacyWorkflowIds[mode];if(!id)throw new Error('Workflow mode is not registered.');return getWorkflow(id,'1.0.0');}
/** Preparation only. Production selectWorkflow/resolveWorkflow never calls this. */
export function routingCandidates(input:{useCase:string;tier:WorkflowDefinition['qualityTiers'][number];inputs:WorkflowDefinition['supportedInputs']}){
 return registry.filter(w=>w.kind==='workflow'&&w.useCase===input.useCase&&w.qualityTiers.includes(input.tier)&&w.requiredInputs.every(i=>input.inputs.includes(i))&&input.inputs.filter(i=>['product','style','pose'].includes(i)).every(i=>w.supportedInputs.includes(i)));
}
export async function auditRegistry(entries=registry,read:(file:string)=>Promise<string>=file=>readFile('comfyui/workflows/'+file,'utf8')){
 const workflows=[];
 for(const w of entries){
  let state:'placeholder'|'match'|'hash_mismatch'|'missing_or_invalid'='placeholder',actualHash:string|null=null;
  if(w.workflowTemplate){try{actualHash=templateHash(JSON.parse(await read(w.workflowTemplate)));state=actualHash===w.templateHash?'match':'hash_mismatch';}catch{state='missing_or_invalid';}}
  workflows.push({id:w.id,version:w.version,status:w.status,releaseState:w.releaseState,benchmarkStatus:w.benchmarkStatus,template:w.workflowTemplate,expectedHash:w.templateHash,actualHash,state});
 }
 const files=await readdir('comfyui/workflows');
 return {workflows,unregisteredTemplates:files.filter(f=>f.endsWith('.json')&&!entries.some(w=>w.workflowTemplate===f))};
}
