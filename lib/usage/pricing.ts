import 'server-only';
import {z} from 'zod';

const rateSchema=z.object({inputPerMillion:z.number().nonnegative().finite(),cachedInputPerMillion:z.number().nonnegative().finite(),outputPerMillion:z.number().nonnegative().finite()}).strict();
export type Rate=z.infer<typeof rateSchema>;
export const pricingVersion='openai-standard-2026-09-19';
// Standard Responses rates, USD. Sources and update instructions: docs/usage.md.
const mini:Rate={inputPerMillion:0.4,cachedInputPerMillion:0.1,outputPerMillion:1.6};
const full:Rate={inputPerMillion:2,cachedInputPerMillion:0.5,outputPerMillion:8};
const registry:Record<string,Rate>={'gpt-4.1-mini':mini,'gpt-4.1-mini-2025-04-14':mini,'gpt-4.1':full,'gpt-4.1-2025-04-14':full};
export function pricing(model:string,env:NodeJS.ProcessEnv=process.env){
 let overrides:Record<string,Rate>={};
 if(env.OPENAI_PRICING_JSON?.trim()){
  try{overrides=z.record(rateSchema).parse(JSON.parse(env.OPENAI_PRICING_JSON));}catch{throw new Error('OPENAI_PRICING_JSON must be a model-to-rates JSON object with finite nonnegative rates.');}
 }
 const rates=overrides[model]??registry[model];
 return rates?{version:overrides[model]?'environment-override':pricingVersion,currency:'USD',basis:'standard token rates',...rates}:null;
}
export type Tokens={inputTokens:number|null;outputTokens:number|null;cachedTokens:number|null;totalTokens:number|null};
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2147483647?v:null;
export function responseTokens(value:unknown):Tokens{
 const u=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const d=(u.input_tokens_details&&typeof u.input_tokens_details==='object'?u.input_tokens_details:{}) as Record<string,unknown>;
 return {inputTokens:count(u.input_tokens),outputTokens:count(u.output_tokens),cachedTokens:count(d.cached_tokens),totalTokens:count(u.total_tokens)};
}
export function estimate(tokens:Tokens,rates:Rate|null){
 const {inputTokens:i,outputTokens:o,cachedTokens:c}=tokens;
 if(!rates||i===null||o===null||c===null||c>i)return null;
 return ((i-c)*rates.inputPerMillion+c*rates.cachedInputPerMillion+o*rates.outputPerMillion)/1_000_000;
}
export function optionalRate(key:string,env:NodeJS.ProcessEnv=process.env){
 const value=env[key]?.trim();if(!value)return null;
 const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error(`${key} must be a finite nonnegative number, or empty.`);
 return n;
}
