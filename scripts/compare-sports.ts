// Two live ComfyUI jobs using saved context and a fixed seed. No OpenAI requests.
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {runCampaign} from '../lib/agents/orchestrator';
import {ComfyUIProvider} from '../lib/providers/image/comfyui';
import {MockLLMProvider} from '../lib/providers/llm/mock';
import {MockVisionProvider} from '../lib/providers/vision/mock';
async function main(){
  const [flag,campaignId,assetId]=process.argv.slice(2);
  if(flag!=='--live'||!campaignId||!assetId)throw new Error('Pass --live campaignId assetId. This submits two GPU jobs.');
  const before=await getCampaign(campaignId);const asset=before?.assets.find(a=>a.id===assetId);
  if(!before?.brandProfile||!before.direction||!asset)throw new Error('Saved campaign strategy and asset are required.');
  process.env.MAX_REFINEMENTS='0';
  for(const mode of ['quality','sports'] as const){
    const image=new ComfyUIProvider({...process.env,COMFYUI_WORKFLOW_MODE:mode,COMFYUI_SEED:'20260917'});
    await runCampaign(campaignId,e=>console.log(`${e.stage}: ${e.status} ${e.message}`),{assetId},{llm:new MockLLMProvider(),image,vision:new MockVisionProvider()});
    const g=(await getCampaign(campaignId))!.assets.find(a=>a.id===assetId)!.generations.at(-1)!;
    console.log(JSON.stringify({mode,version:g.version,id:g.id,imageUrl:g.imageUrl,context:g.context,note:'Mock score is not evidence of visual quality; inspect the images.'}));
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Sports comparison failed');process.exitCode=1;}).finally(()=>db.$disconnect());
