import 'server-only';
import sharp from 'sharp';
import { storage, detectMime } from '@/lib/storage';
/** Only our generated-image storage IDs are accepted, never arbitrary paths or remote URLs. */
export async function visionImage(imageUrl: string,sourceReference=false) {
  if (!imageUrl) throw new Error('Vision image is missing. Generate an image before requesting a review.');
  const match = /^\/api\/generated\/([a-f0-9-]{36}\.png)$/.exec(imageUrl);
  if (!match) throw new Error('Invalid vision image. OpenAI vision requires a stored generated PNG; mock SVGs and external URLs are unsupported.');
  let bytes: Buffer;
  try { bytes = await storage.getGenerated(match[1]); } catch { throw new Error('Vision image is missing or cannot be read from generated image storage.'); }
  if (bytes.length > (sourceReference?160:32) * 1024 * 1024 || detectMime(bytes) !== 'image/png') throw new Error('Invalid vision image: expected a bounded stored PNG.');
  try {
    const jpeg = await sharp(bytes, { limitInputPixels: sourceReference?40_000_000:16_000_000, failOn:'warning' }).rotate()
      .resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer();
    if (jpeg.length > 4 * 1024 * 1024) throw new Error();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch { throw new Error('Invalid vision image: PNG decoding or bounded image preparation failed.'); }
}

/** Only a campaign-owned reference selected by the server may enter this boundary. */
export async function visionProductReference(reference:{id:string;sha256:string}){
 const {createHash}=await import('node:crypto');const bytes=await storage.get(reference.id);
 if(bytes.length>32*1024*1024||!['image/jpeg','image/png','image/webp'].includes(detectMime(bytes)??''))throw new Error('Invalid stored product reference.');
 if(createHash('sha256').update(bytes).digest('hex')!==reference.sha256)throw new Error('Product reference changed since generation.');
 const jpeg=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:90}).toBuffer();
 if(jpeg.length>4*1024*1024)throw new Error('Product reference exceeds Vision input limit.');
 return 'data:image/jpeg;base64,'+jpeg.toString('base64');
}
