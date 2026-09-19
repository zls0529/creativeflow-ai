import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {storage} from '@/lib/storage';
import {conditioningStrengthSchema} from '@/types/reference';
import type {ImageRequest} from './base';

export function selectedReferences(request:ImageRequest){
  const strengths=conditioningStrengthSchema.parse(request.conditioningStrength || {});
  return (['style','product'] as const).flatMap(role=>{
    const explicit=role==='product'?request.productReference:request.styleReference;
    const matching=(request.references || []).filter(r=>r.role===role || (role==='style' && r.role==='reference'));
    if(!explicit && matching.length>1)throw new Error(`Multiple ${role} references found. Select one explicitly for this request; references will not be silently dropped.`);
    const ref=explicit || matching[0];if(!ref)return [];
    if(!/^[a-zA-Z0-9-]+$/.test(ref.id)||!['image/png','image/jpeg','image/webp'].includes(ref.mime))throw new Error(`Invalid ${role} reference. Use a stored PNG, JPEG or WebP.`);
    if(explicit && !(request.references || []).some(r=>r.id===ref.id && r.mime===ref.mime && (r.role===role || (role==='style' && r.role==='reference'))))throw new Error(`The selected ${role} reference does not belong to this campaign's ${role} uploads.`);
    return [{...ref,role,strength:strengths[role] ?? (role==='product'?0.8:0.4),weightType:role==='product'?'linear' as const:'style transfer' as const}];
  });
}
export async function validateReferenceImage(bytes:Buffer,layout:'clip_square'|'native'='clip_square'){
  if(!bytes.length || bytes.length>5*1024*1024)throw new Error('Reference image must be under 5 MB.');
  try{
    const input=sharp(bytes,{limitInputPixels:40000000});const m=await input.metadata();
    if(!['png','jpeg','webp'].includes(m.format || '') || (m.pages || 1)>1 || !m.width || !m.height || Math.min(m.width,m.height)<64)throw new Error();
    if(layout==='native')return await input.rotate().flatten({background:'#ffffff'}).png().toBuffer();
    // Square padding preserves the complete product when CLIP center-crops its input.
    return await input.rotate().flatten({background:'#ffffff'}).resize(768,768,{fit:'contain',background:'#ffffff'}).png().toBuffer();
  }catch{throw new Error('Invalid reference image: use a decodable single-frame PNG/JPEG/WebP, 64 pixels or larger and at most 40 megapixels.');}
}
export async function loadReferences(request:ImageRequest){
  return Promise.all(selectedReferences(request).map(async ref=>{
    let source:Buffer;try{source=await storage.get(ref.id);}catch{throw new Error(`The ${ref.role} reference is missing from project storage. Upload it again.`);}
    return {...ref,bytes:await validateReferenceImage(source),sha256:createHash('sha256').update(source).digest('hex')};
  }));
}
