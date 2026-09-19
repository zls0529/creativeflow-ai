// Manual only: two ComfyUI jobs and two real Vision Critic requests, no automatic regeneration.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {runCampaign,withCampaignLock} from '../lib/agents/orchestrator';
import {ComfyUIProvider} from '../lib/providers/image/comfyui';
import {loadPoseReference,validatePoseImage} from '../lib/providers/image/pose';
import {storage} from '../lib/storage';
import {MockLLMProvider} from '../lib/providers/llm/mock';
import {OpenAIVisionProvider} from '../lib/providers/vision/openai';
async function main(){
  const [flag,campaignId,assetId,poseFile]=process.argv.slice(2);
  if(flag!=='--live'||!campaignId||!assetId)throw new Error('Usage: --live campaignId assetId [local-pose-photo]. Performs two GPU generations and two paid Vision reviews.');
  let campaign=await getCampaign(campaignId);
  const asset=campaign?.assets.find(a=>a.id===assetId);
  if(!campaign?.brandProfile||!campaign.direction||!asset)throw new Error('Saved campaign strategy and asset are required.');
  const vision=new OpenAIVisionProvider();
  if(poseFile){
    if(campaign.uploads.some(f=>f.role==='pose'))throw new Error('Campaign already has a pose reference; omit the file argument.');
    let source:Buffer;try{source=await readFile(poseFile);}catch{throw new Error('Cannot read the supplied pose photo.');}
    const bytes=await validatePoseImage(source),id=randomUUID();
    await withCampaignLock(campaignId,async()=>{
      if(await db.upload.count({where:{campaignId}})>=8)throw new Error('Campaign already has 8 references.');
      await storage.put(id,bytes);
      try{await db.upload.create({data:{id,campaignId,role:'pose',name:'Running pose reference.png',mime:'image/png',size:bytes.length}});}catch(error){await storage.remove(id);throw error;}
    });
    campaign=(await getCampaign(campaignId))!;
  }
  const request={prompt:asset.prompt,brand:campaign.brandProfile!,direction:campaign.direction!,brandName:campaign.brandName,kind:asset.kind,width:asset.width,height:asset.height,version:1,references:campaign.uploads};
  await loadPoseReference(request);
  // Check pose dependencies before spending either comparison generation.
  await new ComfyUIProvider({...process.env,COMFYUI_WORKFLOW_MODE:'sports_pose'}).resolveWorkflow(request);
  process.env.MAX_REFINEMENTS='0';
  for(const mode of ['sports','sports_pose'] as const){
    const image=new ComfyUIProvider({...process.env,COMFYUI_WORKFLOW_MODE:mode,COMFYUI_SEED:'20260917'});
    await runCampaign(campaignId,e=>console.log(`${e.stage}: ${e.status} ${e.message}`),{assetId},{llm:new MockLLMProvider(),image,vision});
    const g=(await getCampaign(campaignId))!.assets.find(a=>a.id===assetId)!.generations.at(-1)!;
    console.log(JSON.stringify({mode,version:g.version,id:g.id,imageUrl:g.imageUrl,context:g.context,evaluation:g.evaluation}));
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Pose comparison failed');process.exitCode=1;}).finally(()=>db.$disconnect());
