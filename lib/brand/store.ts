import 'server-only';
import {db} from '@/lib/database/client';
import {brandIntelligenceSchema,emptyIntelligence,type BrandIntelligence} from '@/types/brand-intelligence';
export async function readIntelligence(id:string){const row=await db.brandProfile.findUnique({where:{campaignId:id}});const data=row?JSON.parse(row.data):{};return {data,intelligence:data._intelligence?brandIntelligenceSchema.parse(data._intelligence):emptyIntelligence()};}
export async function saveIntelligence(id:string,intelligence:BrandIntelligence){const {data}=await readIntelligence(id);const encoded=JSON.stringify({...data,_intelligence:brandIntelligenceSchema.parse(intelligence)});await db.brandProfile.upsert({where:{campaignId:id},create:{campaignId:id,data:encoded},update:{data:encoded}});}
export async function saveBrandProfile(id:string,brand:unknown,revision?:string){const {intelligence}=await readIntelligence(id);const data=JSON.stringify({...brand as object,_intelligence:intelligence,_constraintsRevision:revision});await db.brandProfile.upsert({where:{campaignId:id},create:{campaignId:id,data},update:{data}});}
