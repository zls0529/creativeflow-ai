import 'server-only';
import type {Providers} from '@/lib/providers';
import {executionCheckpoint,executionFence} from './context';
/** Provider calls are fenced, but not aborted on cancellation: completed output can be saved. */
export function controlledProviders(p:Providers):Providers {
 return {llm:{name:p.llm.name,generate:async r=>{await executionCheckpoint();const result=await p.llm.generate(r);await executionFence();return result;}},vision:{name:p.vision.name,evaluate:async r=>{await executionCheckpoint();const result=await p.vision.evaluate(r);await executionFence();return result;}},image:{name:p.image.name,repair:p.image.repair?async r=>{await executionCheckpoint();const result=await p.image.repair!(r);await executionFence();return result;}:undefined,dimensions:p.image.dimensions?.bind(p.image),workflow:p.image.workflow?.bind(p.image),describe:p.image.describe?.bind(p.image),resolveWorkflow:p.image.resolveWorkflow?async r=>{await executionCheckpoint();const result=await p.image.resolveWorkflow!(r);await executionFence();return result;}:undefined,generate:async r=>{await executionCheckpoint();const result=await p.image.generate(r);await executionFence();return result;}}};
}
