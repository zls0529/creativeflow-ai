import 'server-only';
import sharp from 'sharp';
import type {z} from 'zod';
import type {maskDiagnosticsSchema} from '@/types/product-hero';
export type MaskDiagnostics=z.infer<typeof maskDiagnosticsSchema>;
/** 8-connected components at source resolution. No deletion of inconvenient fragments. */
export async function inspectProductMask(bytes:Buffer,width:number,height:number){
 const m=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
 if(m.width!==width||m.height!==height)throw new Error('Segmentation mask dimensions do not match the source.');
 const raw=await sharp(bytes).removeAlpha().greyscale().raw().toBuffer(),binary=Buffer.from(raw.map(v=>v>127?255:0));
 const seen=new Uint8Array(raw.length),queue=new Uint32Array(raw.length),components:number[]=[];
 let count=0,left=width,top=height,right=-1,bottom=-1;
 for(let i=0;i<raw.length;i++)if(binary[i]){count++;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 for(let i=0;i<raw.length;i++)if(binary[i]&&!seen[i]){
  let head=0,tail=1;queue[0]=i;seen[i]=1;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const n=yy*width+xx;if(binary[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}}
  }components.push(tail);
 }
 components.sort((a,b)=>b-a);const coverage=count/raw.length,bw=Math.max(0,right-left+1),bh=Math.max(0,bottom-top+1),largestComponentRatio=count?(components[0]??0)/count:0,noiseLimit=Math.max(16,count*.001),smallFragmentRatio=count?components.filter(n=>n<noiseLimit).reduce((a,b)=>a+b,0)/count:0;
 const significantComponents=components.filter(n=>n>=Math.max(32,count*.01)).length,boundsFill=count/(bw*bh||1),reasons:string[]=[];
 if(coverage<.003||bw<Math.max(8,width*.015)||bh<Math.max(8,height*.015))reasons.push('Mask is empty or too small to establish a usable product.');
 if(coverage>.94)reasons.push('Mask covers almost the entire image.');
 if(count&&(left<2||top<2||right>=width-2||bottom>=height-2))reasons.push('Foreground touches the source boundary; use a complete product with padding.');
 if(count&&(largestComponentRatio<.85||significantComponents>4))reasons.push('No dominant connected product: multiple substantial components or fragmented extraction.');
 if(count&&(smallFragmentRatio>.02||components.length>64))reasons.push('Mask contains excessive tiny scattered fragments.');
 if(count&&boundsFill<.12)reasons.push('Foreground is too sparse within its bounding area.');
 const diagnostics:MaskDiagnostics={coverage,componentCount:components.length,significantComponents,largestComponentRatio,smallFragmentRatio,boundsFill,accepted:reasons.length===0,reasons,width,height};
 return {raw:binary,coverage,bounds:{left,top,width:bw,height:bh},png:await sharp(binary,{raw:{width,height,channels:1}}).png().toBuffer(),diagnostics};
}
export async function validateProductMask(bytes:Buffer,width:number,height:number){const result=await inspectProductMask(bytes,width,height);if(!result.diagnostics.accepted)throw new Error(result.diagnostics.reasons.join(' '));return result;}
