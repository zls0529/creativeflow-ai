import 'server-only';
import sharp from 'sharp';
import {storage} from '@/lib/storage';
import {regionSchema,type RepairRegion} from '@/types/repair';
export async function sourceImage(url:string){
 const id=/^\/api\/generated\/([a-f0-9-]{36}\.png)$/.exec(url)?.[1];if(!id)throw new Error('Repair requires an existing stored PNG. Mock SVGs and external paths are unsupported.');
 try{const bytes=await storage.getGenerated(id);if(bytes.length>32*1024*1024)throw new Error();const {data,info}=await sharp(bytes,{limitInputPixels:16_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});if(info.width%8||info.height%8)throw new Error();return {bytes,raw:data,width:info.width,height:info.height};}catch{throw new Error('Repair source image is missing, unreadable or has unsupported dimensions.');}
}
export async function rectangleMask(width:number,height:number,region:RepairRegion){
 const r=regionSchema.parse(region),x=Math.floor(r.x*width),y=Math.floor(r.y*height),w=Math.min(width-x,Math.round(r.width*width)),h=Math.min(height-y,Math.round(r.height*height));
 if(w<8||h<8)throw new Error('Repair region is empty or too small. Select at least 8 × 8 pixels.');
 const raw=Buffer.alloc(width*height);const feather=Math.min(8,Math.floor(Math.min(w,h)/4));
 for(let j=0;j<h;j++)for(let i=0;i<w;i++)raw[(y+j)*width+x+i]=Math.max(1,Math.round(255*Math.min(1,(1+Math.min(i,j,w-1-i,h-1-j))/feather)));
 return sharp(raw,{raw:{width,height,channels:1}}).png().toBuffer();
}
export async function maskPixels(mask:Buffer,width:number,height:number){
 let decoded;try{decoded=await sharp(mask,{limitInputPixels:16_000_000}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});}catch{throw new Error('Invalid repair mask.');}
 if(decoded.info.width!==width||decoded.info.height!==height)throw new Error('Repair mask dimensions do not match the source.');
 const count=decoded.data.reduce((n,v)=>n+(v>0?1:0),0);if(!count)throw new Error('Repair mask is empty; no target detected. Select a manual region.');if(count>width*height*0.6)throw new Error('Repair mask covers too much of the image (maximum 60%). Use a smaller manual region.');return decoded.data;
}
/** Recompose from source bytes, guaranteeing exactly unchanged decoded pixels outside the mask. */
export async function compositeRepair(source:Awaited<ReturnType<typeof sourceImage>>,candidate:Buffer,mask:Buffer){
 const m=await maskPixels(mask,source.width,source.height);let image;
 try{image=await sharp(candidate,{limitInputPixels:16_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});}catch{throw new Error('Invalid repaired image output.');}
 if(image.info.width!==source.width||image.info.height!==source.height)throw new Error('Repaired image dimensions changed. No output accepted.');
 const result=Buffer.from(source.raw);let changedPixels=0;
 for(let p=0;p<m.length;p++){if(!m[p])continue;let changed=false;for(let c=0;c<3;c++){const i=p*4+c;result[i]=Math.round(source.raw[i]*(1-m[p]/255)+image.data[i]*(m[p]/255));changed ||=result[i]!==source.raw[i];}if(changed)changedPixels++;}
 if(!changedPixels)throw new Error('Repair produced no changed pixels in the target mask. No successful repair was recorded.');
 return {bytes:await sharp(result,{raw:{width:source.width,height:source.height,channels:4}}).png().toBuffer(),changedPixels};
}
