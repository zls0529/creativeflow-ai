// Explicit live comparison: two ComfyUI jobs, no LLM requests. Not part of npm test.
import { db } from '../lib/database/client';
import { createCampaign, getCampaign } from '../lib/database/campaigns';
import { runCampaign } from '../lib/agents/orchestrator';
import { ComfyUIProvider } from '../lib/providers/image/comfyui';
import { MockLLMProvider } from '../lib/providers/llm/mock';
import { MockVisionProvider } from '../lib/providers/vision/mock';
import { analyseBrand, directCampaign } from '../lib/agents/creative';
import { promptSchema } from '../types/campaign';
async function main() {
  if (!process.argv.includes('--live')) throw new Error('Pass --live to submit two local ComfyUI jobs.');
  const brief = { name:'Midnight Pulse — workflow comparison', brandName:'AERON RUN', objective:'Launch a lightweight running shoe for urban runners.', audience:'Urban runners', brief:'Dynamic night running on wet city streets with cinematic lighting and premium sports photography. One adult runner in full-body side view with shoes visible.', style:'Premium sports photography', colours:['#152435','#37D6ED'] };
  const campaign = await createCampaign(brief);
  const llm = new MockLLMProvider();
  const brand = await analyseBrand(llm,brief,[]);
  const direction = { ...await directCampaign(llm,brief,brand), visual_direction:brief.brief, lighting:'Cyan street light and warm rim lighting at night.' };
  await db.brandProfile.create({data:{campaignId:campaign.id,data:JSON.stringify(brand)}});
  await db.creativeDirection.create({data:{campaignId:campaign.id,data:JSON.stringify(direction)}});
  const prompt = promptSchema.parse({ subject:'One adult athletic runner wearing lightweight running shoes and dark sportswear, running naturally in mid-stride.', environment:'Wet urban street at midnight, distant city lights reflected on wet asphalt.', composition:'Full-body side view, entire runner and both shoes inside the frame, runner on right third, generous empty space on left.', camera:'Premium sports photography, eye-level 50mm lens, panning shot with motion blur on the runner and background.', lighting:direction.lighting, colour_palette:'Midnight blue, cyan accents, subtle warm highlights.', style:'Realistic cinematic sports campaign photography.', brand_constraints:'AERON RUN Midnight Pulse, emphasize lightweight shoes, no lettering or logos.', negative_prompt:'watermark, text, logos, low quality, cropped feet' });
  const asset = await db.campaignAsset.create({data:{campaignId:campaign.id,kind:'hero',name:'Hero campaign',width:1024,height:768,prompt:JSON.stringify(prompt)}});
  process.env.MAX_REFINEMENTS = '0';
  for (const mode of ['basic','quality'] as const) {
    const image = new ComfyUIProvider({ ...process.env, COMFYUI_WORKFLOW_MODE:mode,COMFYUI_SEED:'20260916' });
    await runCampaign(campaign.id,e=>console.log(`${e.stage}: ${e.status} ${e.message}`),{assetId:asset.id},{llm,image,vision:new MockVisionProvider()});
    const generation = (await getCampaign(campaign.id))!.assets[0].generations.at(-1)!;
    console.log(JSON.stringify({campaignId:campaign.id,mode,seed:20260916,version:generation.version,imageUrl:generation.imageUrl}));
  }
}
main().catch(e=>{console.error(e instanceof Error ? e.message : 'Comparison failed');process.exitCode=1;}).finally(()=>db.$disconnect());
