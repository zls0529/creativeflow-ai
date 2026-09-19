// Explicit paid vision review of existing images. Never invoked by npm test; no image generation.
import { db } from '../lib/database/client';
import { getCampaign } from '../lib/database/campaigns';
import { saveEvaluation } from '../lib/database/evaluations';
import { withCampaignLock } from '../lib/agents/orchestrator';
import { OpenAIVisionProvider } from '../lib/providers/vision/openai';
async function main() {
  const [flag,...imageUrls] = process.argv.slice(2);
  if (flag !== '--live' || !imageUrls.length) throw new Error('Pass --live followed by stored /api/generated/<id>.png URLs to review. Each image makes one paid OpenAI request.');
  const provider = new OpenAIVisionProvider();
  for (const imageUrl of imageUrls) {
    const generation = await db.generation.findFirst({where:{imageUrl},include:{asset:true}});
    if (!generation) throw new Error('No generation matches the supplied image URL.');
    await withCampaignLock(generation.asset.campaignId,async()=>{
      const c = await getCampaign(generation.asset.campaignId);
      if (!c?.brandProfile || !c.direction) throw new Error('Saved campaign context is incomplete.');
      const asset = c.assets.find(a=>a.id===generation.assetId)!;
      const g = asset.generations.find(g=>g.id===generation.id)!;
      const run = await db.agentRun.create({data:{campaignId:c.id,stage:'Vision Review',status:'running',message:`Reviewing ${asset.name} version ${g.version}. [Vision: openai]`}});
      try {
        const result = await provider.evaluate({imageUrl:g.imageUrl,prompt:g.prompt,brand:c.brandProfile,direction:c.direction,objective:c.objective,placement:asset.kind,version:g.version,iteration:0});
        await saveEvaluation(g.id,provider.name,result);
        await db.agentRun.update({where:{id:run.id},data:{status:'completed'}});
        console.log(JSON.stringify({campaign:c.name,generationId:g.id,version:g.version,imageUrl,model:result.model,overall:result.overall,scoring:result.scoring,blockingIssues:result.blockingIssues,findings:result.findings,integrity:result.integrity}));
      } catch(error) {
        await db.agentRun.update({where:{id:run.id},data:{status:'failed',message:`Vision: openai. ${error instanceof Error ? error.message : 'Review failed.'}`}});
        throw error;
      }
    });
  }
}
main().catch(e=>{console.error(e instanceof Error ? e.message : 'Vision verification failed');process.exitCode=1;}).finally(()=>db.$disconnect());
