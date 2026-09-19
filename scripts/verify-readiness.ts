import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkReadiness,readinessRequests} from '../lib/readiness';
import {getCampaign} from '../lib/database/campaigns';
import {db} from '../lib/database/client';
async function main(){
 const campaign=await getCampaign(process.argv[2]||'cmu416g9w0000v16gqandk68k');
 if(!campaign)throw new Error('Select an existing campaign.');
 const hero=campaign.assets.find(a=>a.kind==='hero');if(!hero)throw new Error('Hero asset is required for this verification.');
 const env={...process.env};
 // A strict allowlist makes accidental paid calls, uploads and generation impossible in this script.
 let calls=0;
 const discovery:typeof fetch=async(url,init)=>{const target=new URL(String(url));assert.equal(target.pathname,'/object_info');assert.equal(init?.method,'GET');assert.ok(['127.0.0.1','localhost'].includes(target.hostname));calls++;return fetch(url,init);};
 const options={campaign,assetId:hero.id};
 const A=await checkReadiness(options,{env,fetch:discovery});
 const B=await checkReadiness(options,{env:{...env,COMFYUI_URL:'http://127.0.0.1:1'},fetch:discovery});
 const C=await checkReadiness(options,{env:{...env,COMFYUI_WORKFLOW_MODE:'sports_pose'},fetch:discovery});
 const plain=readinessRequests(options).requests.map(r=>({...r,references:[],productReference:undefined,styleReference:undefined}));
 const D=await checkReadiness({requests:plain},{env:{...env,COMFYUI_WORKFLOW_MODE:'basic'},fetch:discovery});
 const report={checkedAt:new Date().toISOString(),campaign:campaign.name,discoveryRequests:calls,paidRequests:0,generations:0,A,B,C,D};
 await writeFile('docs/readiness-verification.json',JSON.stringify(report,null,2)+'\n');
 for(const [scenario,result] of Object.entries({A,B,C,D}))console.log(scenario,JSON.stringify({canGenerate:result.canGenerate,modes:result.workflowModes,blocking:result.items.filter(i=>i.severity==='blocking'),optional:result.items.filter(i=>['pose','face','adapter','refs'].includes(i.id))}));
 assert.equal(A.canGenerate,true,'A: normal campaign');assert.equal(B.canGenerate,false,'B: unreachable service');assert.equal(C.items.find(i=>i.id==='pose')?.status,'ready','C: pose dependencies');assert.equal(C.canGenerate,true);
 assert.equal(D.canGenerate,true);for(const id of ['pose','face','adapter','refs'])assert.equal(D.items.find(i=>i.id===id)?.status,'not_required');
}
main().catch(()=>{console.error('Readiness verification did not meet all expectations. See the sanitized report in docs/readiness-verification.json.');process.exitCode=1;}).finally(()=>db.$disconnect());
