import 'server-only';
import sharp from 'sharp';
import {validateProductMask} from './mask';
export {validateProductMask} from './mask';
import type {ProductHeroInput} from '@/types/product-hero';
export async function decodeProduct(bytes:Buffer){
 if(bytes.length>10*1024*1024)throw new Error('Product reference exceeds 10 MB.');
 const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}),m=await image.metadata();
 if(!['png','jpeg','webp'].includes(m.format??'')||(m.pages??1)!==1||!m.width||!m.height||Math.min(m.width,m.height)<256)throw new Error('Use one clean PNG/JPEG/WebP product image, minimum 256 pixels per side.');
 // Normalize orientation and colour once; this PNG is the preservation reference.
 const normalized=await image.rotate().toColourspace('srgb').ensureAlpha().png().toBuffer();
 const {data,info}=await sharp(normalized).raw().toBuffer({resolveWithObject:true});
 return {bytes:normalized,raw:data,width:info.width,height:info.height};
}
export function productPlacement(source:{width:number;height:number},canvas:{width:number;height:number},input:ProductHeroInput){
 let minX=input.margin,maxX=1-input.margin;
 if(input.copySpace==='left')minX=Math.max(minX,0.38);if(input.copySpace==='right')maxX=Math.min(maxX,0.62);
 const factor=Math.min(canvas.width*input.scale/source.width,canvas.height*0.72/source.height,canvas.width*(maxX-minX)/source.width);
 const width=Math.max(1,Math.round(source.width*factor)),height=Math.max(1,Math.round(source.height*factor));
 const preferred=input.placement==='custom'?input.position:input.placement==='left'?{x:0.3,y:0.57}:input.placement==='right'?{x:0.7,y:0.57}:input.placement==='lower-center'?{x:0.5,y:0.68}:{x:0.5,y:0.5};
 const left=Math.round(Math.max(canvas.width*minX,Math.min(canvas.width*maxX-width,canvas.width*preferred.x-width/2)));
 const top=Math.round(Math.max(canvas.height*input.margin,Math.min(canvas.height*(1-input.margin)-height,canvas.height*preferred.y-height/2)));
 return {left,top,width,height};
}
export async function compositeProduct(source:Awaited<ReturnType<typeof decodeProduct>>,maskBytes:Buffer,background:Buffer,input:ProductHeroInput){
 const mask=await validateProductMask(maskBytes,source.width,source.height),bg=await sharp(background).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true}),W=bg.info.width,H=bg.info.height;
 const p=productPlacement(mask.bounds,{width:W,height:H},input),fg=await sharp(source.bytes).extract(mask.bounds).resize(p.width,p.height,{kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
 const alpha=await sharp(mask.png).extract(mask.bounds).resize(p.width,p.height,{kernel:'nearest'}).greyscale().raw().toBuffer();
 const edge=Buffer.from(alpha);for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;sum+=xx>=0&&xx<p.width&&yy>=0&&yy<p.height?alpha[yy*p.width+xx]:0;}edge[y*p.width+x]=Math.min(alpha[y*p.width+x],Math.round(sum/9));}
 const pixels=Buffer.from(bg.data),ground=p.top+p.height;
 // Analytic contact + diffuse shadow affects background only, before product compositing.
 for(let y=Math.max(0,ground-Math.ceil(H*.06));y<Math.min(H,ground+Math.ceil(H*.06));y++)for(let x=Math.max(0,p.left-Math.ceil(W*.06));x<Math.min(W,p.left+p.width+Math.ceil(W*.06));x++){
  const dx=(x-(p.left+p.width*.5))/(p.width*.5),dy=(y-ground)/(H*.025),soft=Math.exp(-2*(dx*dx+dy*dy))*.2,contact=Math.exp(-4*(dx*dx+dy*dy*5))*.3;
  for(let c=0;c<3;c++)pixels[(y*W+x)*3+c]=Math.round(pixels[(y*W+x)*3+c]*(1-Math.min(.5,soft+contact)));
 }
 if(input.reflection)for(let y=0;y<Math.min(p.height*.2,H-ground);y++)for(let x=0;x<p.width;x++){const src=(p.height-1-y)*p.width+x,a=edge[src]/255*.12*(1-y/(p.height*.2));for(let c=0;c<3;c++){const dest=((ground+y)*W+p.left+x)*3+c;pixels[dest]=Math.round(pixels[dest]*(1-a)+fg[src*3+c]*a);}}
 const foreground=Buffer.alloc(p.width*p.height*4);let corePixels=0;
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const i=y*p.width+x,a=edge[i]/255,d=((p.top+y)*W+p.left+x)*3;
  for(let c=0;c<3;c++){let v=fg[i*3+c];if(input.edgeIntegration&&a>0&&a<1){const gain=Math.max(.95,Math.min(1.05,(pixels[d]+pixels[d+1]+pixels[d+2]+60)/(fg[i*3]+fg[i*3+1]+fg[i*3+2]+60)));v=Math.round(v*gain);v=Math.min(255,v);}foreground[i*4+c]=v;pixels[d+c]=Math.round(v*a+pixels[d+c]*(1-a));}foreground[i*4+3]=edge[i];if(edge[i]===255)corePixels++;
 }
 if(corePixels<100)throw new Error('No usable opaque product core remains after placement.');
 const png=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).png().toBuffer(),decoded=await sharp(png).removeAlpha().raw().toBuffer();let changed=0,error=0;
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const i=y*p.width+x;if(edge[i]!==255)continue;let differs=false;for(let c=0;c<3;c++){const delta=Math.abs(decoded[((p.top+y)*W+p.left+x)*3+c]-fg[i*3+c]);error+=delta;differs||=delta>0;}if(differs)changed++;}
 if(changed)throw new Error('Product preservation check failed: opaque core pixels changed.');
 return {png,foreground:await sharp(foreground,{raw:{width:p.width,height:p.height,channels:4}}).extend({top:4,bottom:4,left:4,right:4,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),mask:mask.png,placement:{...p,sourceBounds:mask.bounds,kernel:'lanczos3' as const},fidelity:{corePixels,coreChangedPixels:changed,coreMeanAbsoluteError:error/(corePixels*3),maskCoverage:mask.coverage,status:'core_preserved_identity_unreviewed' as const,limitations:['Exact equality is measured only against the resized, colour-normalized opaque core, not all original pixels.','Segmentation can omit parts or retain background; logos, silhouette completeness and identity still need reference-aware review.','Lanczos scaling changes sampling; translucent products and strong perspective mismatch are unsupported.','Isolated foreground artifact includes four transparent padding pixels on each side; placement dimensions exclude this artifact-only padding.']}};
}
