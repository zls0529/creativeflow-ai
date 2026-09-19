// Read-only verification against saved references and local dependency catalogs.
// Never submits a job, invokes an agent, uploads a reference or generates an image.
import {db} from '../lib/database/client';
import {getCampaign} from '../lib/database/campaigns';
import {freezeRouting} from '../lib/workflows/routing';
import {checkReadiness} from '../lib/readiness';
import type {CreativeSelection} from '../types/creative-mode';
async function main(){
 const row=await db.campaign.findFirstOrThrow({where:{name:{startsWith:'Midnight Pulse'}}});
 const c=(await getCampaign(row.id))!,hero=c.assets.find(a=>a.kind==='hero')!;
 const before=await db.generation.count(),usage=await db.usageEvent.count();
 const cases:{scenario:string;creative:CreativeSelection;pose:boolean}[]=[
  {scenario:'A Commercial Poster',creative:{mode:'commercial_poster'},pose:true},
  {scenario:'B Product Hero',creative:{mode:'product_hero'},pose:false},
  {scenario:'C Sports with pose',creative:{mode:'sports'},pose:true},
  {scenario:'D Sports without pose',creative:{mode:'sports'},pose:false},
  {scenario:'E Custom quality',creative:{mode:'custom',override:{workflowId:'legacy_quality_v1',version:'1.0.0',reason:'Read-only routing verification'}},pose:false}
 ];
 const results=[];
 for(const item of cases){const campaign={...c,creative:item.creative,uploads:c.uploads.filter(u=>item.pose||u.role!=='pose')},routing=freezeRouting(campaign,{assetId:hero.id})!;
  const report=await checkReadiness({campaign,assetId:hero.id,routing});results.push({scenario:item.scenario,selected:routing[0].selected.id,maturity:routing[0].maturity,ready:report.canGenerate,blockers:report.items.filter(i=>i.severity==='blocking').map(i=>i.explanation),dependencies:report.items.map(i=>i.name)});
 }
 if(await db.generation.count()!==before||await db.usageEvent.count()!==usage)throw new Error('Unexpected generation or usage change during read-only verification.');
 console.log(JSON.stringify({campaign:c.name,historicalMode:c.creative??'Not recorded',results,noNewGenerations:true,noNewUsageEvents:true},null,2));
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e instanceof Error?e.message:'Verification failed');process.exitCode=1;});
