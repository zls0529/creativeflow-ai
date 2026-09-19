import 'server-only';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
export function productTransport(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch,label='Product Hero'){
 let base:URL;try{base=new URL(env.COMFYUI_URL??'');if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw new Error();}catch{throw new Error(label+' requires a valid credential-free COMFYUI_URL.');}
 const duration=Number(env.COMFYUI_TIMEOUT_MS||300000);if(!Number.isInteger(duration)||duration<1000||duration>600000)throw new Error('Invalid ComfyUI timeout.');
 async function bytes(endpoint:string,init:RequestInit={},signal=AbortSignal.timeout(duration)){
  let r:Response;try{r=await fetcher(new URL(base.pathname.replace(/\/$/,'')+'/'+endpoint,base),{...init,signal,redirect:'error'});}catch{throw new Error(signal.aborted?label+' ComfyUI timeout.':label+' ComfyUI is unreachable.');}
  if(!r.ok||!r.body)throw new Error(label+' ComfyUI request failed (HTTP '+r.status+').');
  const chunks:Uint8Array[]=[];let total=0;const reader=r.body.getReader();while(true){const p=await reader.read();if(p.done)break;total+=p.value.length;if(total>32*1024*1024){await reader.cancel();throw new Error('ComfyUI response exceeds size limit.');}chunks.push(p.value);}return Buffer.concat(chunks);
 }
 async function json(endpoint:string,init:RequestInit={},signal?:AbortSignal){const b=await bytes(endpoint,init,signal);try{return JSON.parse(b.toString());}catch{throw new Error('Invalid ComfyUI JSON response.');}}
 return {
  catalog:()=>json('object_info',{},AbortSignal.timeout(5000)),
  async upload(buffer:Buffer){const data=new FormData();data.append('image',new Blob([new Uint8Array(buffer)],{type:'image/png'}),'product-hero-'+randomUUID()+'.png');data.append('type','input');data.append('overwrite','false');return z.object({name:z.string().regex(/^[a-zA-Z0-9-]+\.png$/),subfolder:z.literal(''),type:z.literal('input')}).parse(await json('upload/image',{method:'POST',body:data})).name;},
  async run(graph:unknown){const signal=AbortSignal.timeout(duration),q=z.object({prompt_id:z.string().regex(/^[a-zA-Z0-9-]+$/),node_errors:z.record(z.unknown()).optional()}).parse(await json('prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:randomUUID()})},signal));if(Object.keys(q.node_errors??{}).length)throw new Error('ComfyUI rejected '+label+' graph nodes.');
   while(!signal.aborted){const h=await json('history/'+q.prompt_id,{},signal),item=h[q.prompt_id];if(item?.status?.status_str==='error')throw new Error(label+' ComfyUI execution failed; inspect local server.');if(item?.status?.completed){const output=z.object({filename:z.string().regex(/^[a-zA-Z0-9_.-]+\.png$/).refine(s=>!s.includes('..')),subfolder:z.string().regex(/^[a-zA-Z0-9_/-]*$/).refine(s=>!s.startsWith('/')&&!s.includes('..')),type:z.literal('output')}).safeParse(item.outputs?.['9']?.images?.[0]);if(!output.success)throw new Error(label+' workflow has no valid PNG output.');return bytes('view?'+new URLSearchParams(output.data),{},signal);}await delay(500);}
   throw new Error(label+' ComfyUI generation timeout.');
  }
 };
}
