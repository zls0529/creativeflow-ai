import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {makeBrandPdf} from '../tests/fixtures/brand-pdf';
import {createCampaign,getCampaign} from '../lib/database/campaigns';
import {db} from '../lib/database/client';
import {storage} from '../lib/storage';
import {analyseBrandFiles,approveRules,checkBrandBrief,resolveBrandConflict} from '../lib/brand/service';
import {readIntelligence,saveIntelligence,saveBrandProfile} from '../lib/brand/store';
import {guardBrand} from '../lib/brand/conflicts';
import {analyseBrand,directCampaign,engineerPrompt} from '../lib/agents/creative';
import {OpenAILLMProvider} from '../lib/providers/llm/openai';
import {OpenAIVisionProvider} from '../lib/providers/vision/openai';
import {saveEvaluation} from '../lib/database/evaluations';
import {assetSpecs} from '../types/campaign';

async function main(){
 if(!process.argv.includes('--live'))throw new Error('Explicit --live required: uses configured OpenAI credentials, no ComfyUI calls.');
 const source=await getCampaign('cmu416g9w0000v16gqandk68k');const sourceAsset=source?.assets.find(a=>a.kind==='hero'),existing=sourceAsset?.generations.find(g=>g.version===8);
 if(!existing?.imageUrl)throw new Error('Existing Midnight Pulse hero V8 is unavailable; no new image will be generated.');
 const resume=process.argv[process.argv.indexOf('--resume')+1];
 const campaign=process.argv.includes('--resume')?await db.campaign.findUniqueOrThrow({where:{id:resume}}):await createCampaign({name:'NORTHLINE LAB — brand intelligence verification',brandName:'NORTHLINE LAB',objective:'Launch premium running shoes with a calm product-led campaign.',audience:'Urban runners',brief:'Feature one pair of premium running shoes as the focal point. Use bright neon green city lighting.',style:'Minimal, premium, calm',colours:['#FFFFFF','#102033','#C0C0C0']});
 console.log('Test campaign:',campaign.id);
 const saved=await getCampaign(campaign.id),savedAsset=saved?.assets[0],savedGeneration=savedAsset?.generations[0],savedConstraints=saved?.brandIntelligence?.approved;
 if(savedGeneration&&saved?.brandProfile&&saved.direction&&savedConstraints){
  const evaluation=savedGeneration.evaluation??await new OpenAIVisionProvider().evaluate({imageUrl:savedGeneration.imageUrl,prompt:savedGeneration.prompt,brand:saved.brandProfile,direction:saved.direction,objective:saved.objective,placement:'hero',version:1,iteration:0,brandConstraints:savedConstraints});
  if(!savedGeneration.evaluation)await saveEvaluation(savedGeneration.id,'openai',evaluation);
  await db.generation.update({where:{id:savedGeneration.id},data:{status:'evaluated'}});await db.campaign.update({where:{id:campaign.id},data:{status:'completed'}});
  await writeFile('storage/brand-intelligence-verification.json',JSON.stringify({campaignId:campaign.id,sourceImage:'Midnight Pulse hero V8 reused; not generated from NORTHLINE rules',extractedRules:savedConstraints.rules,conflicts:saved.brandIntelligence?.conflicts,direction:saved.direction,prompt:savedAsset.prompt,evaluation},null,2));
  console.log(JSON.stringify({campaignId:campaign.id,rules:savedConstraints.rules.length,overall:evaluation.overall,compliance:evaluation.brandCompliance?.findings}));return;
 }
 const pdf=makeBrandPdf(['NORTHLINE LAB - Brand Guidelines','Primary colours: white, dark navy and silver.','Avoid neon green and orange.','Visual style: minimal, premium and calm.','Lighting: soft controlled studio light.','The product must remain the main focal point.','Avoid crowded scenes.']);
 await writeFile('storage/northline-brand-guidelines.pdf',pdf);
 if(!await db.upload.count({where:{campaignId:campaign.id}})){const uploadId=randomUUID();await storage.put(uploadId,pdf);await db.upload.create({data:{id:uploadId,campaignId:campaign.id,name:'northline-brand-guidelines.pdf',role:'guidelines',mime:'application/pdf',size:pdf.length}});}
 const llm=new OpenAILLMProvider();await analyseBrandFiles(campaign.id,llm);const {intelligence}=await readIntelligence(campaign.id);
 await saveIntelligence(campaign.id,approveRules(intelligence,intelligence.draft!.rules.map(({id,text,visuallyEvaluable,binding})=>({id,text,visuallyEvaluable,binding}))));
 try{await checkBrandBrief(campaign.id,llm);}catch(e){if(!(e instanceof Error)||!e.message.includes('conflict requires attention'))throw e;}
 const checked=(await readIntelligence(campaign.id)).intelligence;if(!checked.conflicts.length)throw new Error('Expected intentional neon conflict was not detected. Stop for inspection.');
 for(const conflict of checked.conflicts)await resolveBrandConflict(campaign.id,conflict.id,'guideline_enforced');
 const constraints=(await readIntelligence(campaign.id)).intelligence.approved!;
 const brief=(await getCampaign(campaign.id))!,brand=await analyseBrand(llm,brief,[],constraints),direction=await directCampaign(llm,brief,brand,constraints);
 await guardBrand(campaign.id,llm,constraints,'direction',direction);
 const prompt=await engineerPrompt(llm,brand,direction,assetSpecs[0],constraints);await guardBrand(campaign.id,llm,constraints,'prompt',prompt);
 await saveBrandProfile(campaign.id,brand,constraints.revision);await db.creativeDirection.create({data:{campaignId:campaign.id,data:JSON.stringify(direction)}});
 const asset=await db.campaignAsset.create({data:{campaignId:campaign.id,kind:'hero',name:'Hero · existing image compliance trial',width:sourceAsset!.width,height:sourceAsset!.height,prompt:JSON.stringify(prompt),status:'needs_review'}});
 const g=await db.generation.create({data:{assetId:asset.id,version:1,provider:existing.provider,imageUrl:existing.imageUrl,prompt:JSON.stringify(existing.prompt),status:'generated',reason:'Existing Midnight Pulse hero V8 reused for brand-compliance testing. This image was not generated from the new NORTHLINE prompt or brand rules.'}});
 const evaluation=await new OpenAIVisionProvider().evaluate({imageUrl:g.imageUrl,prompt:existing.prompt,brand,direction,objective:brief.objective,placement:'hero',version:1,iteration:0,brandConstraints:constraints});
 await saveEvaluation(g.id,'openai',evaluation);await db.generation.update({where:{id:g.id},data:{status:'evaluated'}});await db.campaign.update({where:{id:campaign.id},data:{status:'completed'}});
 const report={campaignId:campaign.id,sourceImage:'Midnight Pulse hero V8, reused; no image generation',extractedRules:constraints.rules,conflicts:checked.conflicts,direction,prompt,evaluation};
 await writeFile('storage/brand-intelligence-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({campaignId:campaign.id,rules:constraints.rules.length,conflicts:checked.conflicts.length,overall:evaluation.overall,compliance:evaluation.brandCompliance?.findings.map(f=>({ruleId:f.ruleId,status:f.status,confidence:f.confidence,severity:f.severity}))}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Brand verification failed.');process.exitCode=1;}).finally(()=>db.$disconnect());
