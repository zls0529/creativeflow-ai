// Explicit live test: one existing asset, at most one automatic refinement. Not part of npm test.
import { db } from '../lib/database/client';
import { getCampaign } from '../lib/database/campaigns';
import { runCampaign } from '../lib/agents/orchestrator';
import { getProviders } from '../lib/providers';
async function main() {
  const [flag,campaignId,assetId] = process.argv.slice(2);
  if(flag !== '--live' || !campaignId || !assetId) throw new Error('Supply --live campaignId assetId. This submits real image and paid OpenAI requests.');
  const providers = getProviders();
  if(providers.llm.name !== 'openai' || providers.image.name !== 'comfyui' || providers.vision.name !== 'openai') throw new Error('Live verification requires OpenAI text, ComfyUI images and OpenAI vision.');
  const before=await getCampaign(campaignId);const asset=before?.assets.find(a=>a.id===assetId);
  if(!before?.brandProfile || !before.direction || !asset) throw new Error('Choose an existing asset with saved campaign strategy and prompt.');
  process.env.MAX_REFINEMENTS='1'; // Process-local cost bound; stop earlier when the image passes.
  await runCampaign(campaignId,e=>console.log(`${e.stage}: ${e.status} — ${e.message}`),{assetId},providers);
  const after=(await getCampaign(campaignId))!.assets.find(a=>a.id===assetId)!;
  console.log(JSON.stringify({campaign:before.name,status:after.status,threshold:process.env.CRITIC_THRESHOLD || 80,maxRefinements:1,generations:after.generations.filter(g=>!asset.generations.some(old=>old.id===g.id)).map(g=>({id:g.id,version:g.version,imageUrl:g.imageUrl,prompt:g.prompt,reason:g.reason,context:g.context,score:g.evaluation?.overall,blockingIssues:g.evaluation?.blockingIssues}))}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
