import type {CampaignView} from '@/types/campaign';
import {repairRequestSchema,type RepairRequest} from '@/types/repair';
import type {ProviderRepairRequest} from '@/lib/providers/image/repair';
export function repairInput(c:CampaignView,assetId:string|undefined,raw:RepairRequest){
 const repair=repairRequestSchema.parse(raw),asset=c.assets.find(a=>a.id===assetId),source=asset?.generations.find(g=>g.id===repair.sourceGenerationId);
 if(!asset||!source?.imageUrl)throw new Error('Repair source generation is unavailable or does not belong to the selected asset.');
 if(!c.brandProfile||!c.direction)throw new Error('Repair requires saved campaign strategy.');
 if(repair.sourceCriticFindingId){const [kind,key]=repair.sourceCriticFindingId.split(':');if(kind==='blocking'&&!source.evaluation?.blockingIssues?.[Number(key)]||kind==='integrity'&&!Object.hasOwn(source.evaluation?.integrity??{},key))throw new Error('The selected source Vision finding is unavailable. Refresh the repair panel.');}
 const request:ProviderRepairRequest={repair,sourceImageUrl:source.imageUrl,sourceVersion:source.version,image:{prompt:source.prompt,brand:c.brandProfile,direction:c.direction,brandName:c.brandName,kind:asset.kind,width:asset.width,height:asset.height,version:Math.max(...asset.generations.map(g=>g.version))+1,references:c.uploads}};
 return {asset,source,request};
}
