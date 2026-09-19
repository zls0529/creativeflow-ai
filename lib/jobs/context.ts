import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
export class JobCancelledError extends Error {constructor(){super('User requested cancellation. No subsequent stages will run.');}}
export class JobLeaseLostError extends Error {constructor(){super('Job ownership expired. Execution stopped; inspect saved results before retrying.');}}
export interface ExecutionContext {routing?:import('@/types/creative-mode').RoutingDecision[];jobId:string;attempt:number;checkpoint:()=>Promise<void>;fence:()=>Promise<void>}
export const executionContext=new AsyncLocalStorage<ExecutionContext>();
export async function executionCheckpoint(){await executionContext.getStore()?.checkpoint();}
export async function executionFence(){await executionContext.getStore()?.fence();}
