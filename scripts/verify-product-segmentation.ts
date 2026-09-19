// Segmentation only. No image provider, campaign execution, background or Vision imports.
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {productHeroInputSchema} from '../types/product-hero';
import {segmentationPlan,extractProduct} from '../lib/product-hero/segmentation';
import {SegmentationError,saveMaskArtifact} from '../lib/product-hero/segmentation-store';
async function main(){
 if(!process.argv.includes('--run'))throw new Error('Use --run to explicitly perform local segmentation only.');
 const manifest=JSON.parse(await readFile('benchmarks/product-hero-v1.json','utf8')),input=productHeroInputSchema.parse({...manifest.input,segmentation:'auto'}),plan=await segmentationPlan(input);
 if(plan.sourceSha256!==manifest.fixture.references[0].sha256)throw new Error('Frozen shoes reference checksum mismatch.');
 const result=await extractProduct(plan,process.env),alpha=await sharp(result.mask).removeAlpha().greyscale().raw().toBuffer();
 const pixels=Buffer.from(plan.source.raw);for(let i=0;i<alpha.length;i++)pixels[i*4+3]=alpha[i];
 const foreground=await sharp(pixels,{raw:{width:plan.source.width,height:plan.source.height,channels:4}}).png().toBuffer(),foregroundUrl=await saveMaskArtifact(foreground);
 const evidence={...result.report,foregroundUrl,backgroundCalls:0,visionCalls:0,fullProductHeroRun:false};
 await writeFile('storage/segmentation-verification-'+result.report.id+'.json',JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify(evidence,null,2));
}
main().catch(e=>{console.error(e instanceof SegmentationError?JSON.stringify(e.report,null,2):e instanceof Error?e.message:'Segmentation failed.');process.exitCode=1;});
