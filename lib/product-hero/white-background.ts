import 'server-only';
import sharp from 'sharp';
/** Conservative border-connected neutral-background removal, not a semantic detector.
 * Only offered for bright, low-chroma, consistent borders. RGB is never changed.
 */
export async function whiteBackgroundMask(source:Buffer,width:number,height:number){
 const {data,info}=await sharp(source).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true}),w=info.width,h=info.height;
 const border:number[]=[];for(let x=0;x<w;x++){border.push(x,(h-1)*w+x);}for(let y=1;y<h-1;y++)border.push(y*w,y*w+w-1);
 const med=[0,1,2].map(c=>{const a=border.map(i=>data[i*3+c]).sort((a,b)=>a-b);return a[Math.floor(a.length/2)];});
 const dist=(i:number)=>Math.max(...med.map((v,c)=>Math.abs(data[i*3+c]-v)));
 if(Math.min(...med)<205||Math.max(...med)-Math.min(...med)>22||border.filter(i=>dist(i)<18).length/border.length<.95)throw new Error('No uniform bright neutral border; automatic white-background removal is unsuitable.');
 const background=new Uint8Array(w*h),queue=new Uint32Array(w*h);let head=0,tail=0;
 const visit=(i:number)=>{if(!background[i]&&dist(i)<=24){background[i]=1;queue[tail++]=i;}};for(const i of border)visit(i);
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)visit(i-1);if(x<w-1)visit(i+1);if(y)visit(i-w);if(y<h-1)visit(i+w);}
 return sharp(Buffer.from(background.map(v=>v?0:255)),{raw:{width:w,height:h,channels:1}}).resize(width,height,{kernel:'nearest'}).png().toBuffer();
}
