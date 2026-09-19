import 'server-only';
import {createHash} from 'node:crypto';

/** Whitespace/key-order independent; array order and parameter values remain significant. */
export function canonicalJSON(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonicalJSON(v)).join(',')+'}';
 throw new Error('Cannot hash unsupported workflow data.');
}
export function checksum(value:unknown){return createHash('sha256').update(canonicalJSON(value)).digest('hex');}
export function templateHash(template:unknown){
 function inspect(value:unknown){
  if(typeof value==='string'&&(/(?:^[a-zA-Z]:[\\/]|^\/|^\\\\|https?:\/\/|sk-[a-z0-9_-]{10,})/i.test(value)))throw new Error('Template hash input cannot contain private paths, URLs or credentials.');
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(/api.?key|authorization|password|secret|token/i.test(key))throw new Error('Template hash input cannot contain credentials.');inspect(item);}
 }
 inspect(template);return checksum(template);
}
