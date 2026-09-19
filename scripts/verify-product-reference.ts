// Manual only: three placement generations/reviews; missing placement prompts use the configured LLM.
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {withCampaignLock,runCampaign} from '../lib/agents/orchestrator';
import {engineerPrompt} from '../lib/agents/creative';
import {assetSpecs} from '../types/campaign';
import {getProviders} from '../lib/providers';
import {ComfyUIProvider} from '../lib/providers/image/comfyui';
import {validateReferenceImage} from '../lib/providers/image/references';
import {storage,detectMime} from '../lib/storage';
async function main(){
  const [flag,campaignId,photo]=process.argv.slice(2);
  if(flag!=='--live'||!campaignId||!photo)throw new Error('Usage: --live campaignId local-product-photo. Uses three GPU generations, real Vision reviews, and missing placement prompts.');
  const providers=getProviders();if(providers.vision.name!=='openai')throw new Error('This live verification expects the configured real Vision Critic.');
  let source:Buffer;try{source=await readFile(photo);}catch{throw new Error('Cannot read supplied product image.');}await validateReferenceImage(source);
  const hash=createHash('sha256').update(source).digest('hex');
  await withCampaignLock(campaignId,async()=>{
    const campaign=await getCampaign(campaignId);if(!campaign?.brandProfile||!campaign.direction)throw new Error('Existing campaign strategy required.');
    const existing=campaign.uploads.filter(f=>f.role==='product');
    if(existing.length>1)throw new Error('Select one product reference before verification.');
    if(existing.length){if(createHash('sha256').update(await storage.get(existing[0].id)).digest('hex')!==hash)throw new Error('Existing product reference differs; refusing to overwrite.');}
    else{
      if(campaign.uploads.length>=8)throw new Error('Campaign upload limit reached.');const id=randomUUID();await storage.put(id,source);
      try{await db.upload.create({data:{id,campaignId,role:'product',name:'Product reference.jpg',mime:detectMime(source)!,size:source.length}});}catch(error){await storage.remove(id);throw error;}
    }
    for(const kind of ['hero','post','product'] as const){
      if(campaign.assets.some(a=>a.kind===kind))continue;
      const spec=assetSpecs.find(a=>a.kind===kind)!;
      const prompt=await engineerPrompt(providers.llm,campaign.brandProfile,campaign.direction,spec);
      await db.campaignAsset.create({data:{campaignId,kind,name:spec.name,width:spec.width,height:spec.height,prompt:JSON.stringify(prompt)}});
    }
  });
  process.env.MAX_REFINEMENTS='0';
  providers.image=new ComfyUIProvider({...process.env,COMFYUI_WORKFLOW_MODE:'auto',COMFYUI_SEED:'20260917',COMFYUI_TIMEOUT_MS:'600000'});
  for(const kind of ['hero','post','product'] as const){
    const campaign=(await getCampaign(campaignId))!;const asset=campaign.assets.find(a=>a.kind===kind)!;
    const last=asset.generations.at(-1);
    const expected=await providers.image.resolveWorkflow?.({prompt:last?.prompt || asset.prompt,brand:campaign.brandProfile!,direction:campaign.direction!,brandName:campaign.brandName,kind:asset.kind,width:asset.width,height:asset.height,version:1,references:campaign.uploads});
    if(last?.context?.workflowMode === expected?.mode && last?.context?.referenceConditioning?.references.some(r=>r.role==='product' && r.sha256===hash) && last.evaluation?.provider==='openai'){
      console.log(JSON.stringify({kind,skipped:true,generation:last}));continue;
    }
    await runCampaign(campaignId,e=>console.log(`${e.stage}: ${e.status} ${e.message}`),{assetId:asset.id},providers,{product:0.8,style:0.4});
    const generation=(await getCampaign(campaignId))!.assets.find(a=>a.id===asset.id)!.generations.at(-1)!;
    console.log(JSON.stringify({kind,generation}));
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Product verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
