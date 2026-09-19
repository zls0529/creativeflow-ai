import 'server-only';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {storage} from '@/lib/storage';
import {segmentationReportSchema,type SegmentationReport} from '@/types/product-hero';
export const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const root=path.join(process.cwd(),'storage','segmentation');
function recordPath(id:string){return path.join(root,z.string().uuid().parse(id)+'.json');}
export async function saveSegmentationReport(report:SegmentationReport){await mkdir(root,{recursive:true});await writeFile(recordPath(report.id),JSON.stringify(segmentationReportSchema.parse(report),null,2),{flag:'wx'});}
export async function readSegmentationReport(id:string){return segmentationReportSchema.parse(JSON.parse(await readFile(recordPath(id),'utf8')));}
export async function saveMaskArtifact(bytes:Buffer){const id=randomUUID()+'.png';await storage.putGenerated(id,bytes);return '/api/generated/'+id;}
export async function getMaskArtifact(url:string){const match=/^\/api\/generated\/([a-f0-9-]{36}\.png)$/.exec(url);if(!match)throw new Error('Invalid mask artifact.');return storage.getGenerated(match[1]);}
export class SegmentationError extends Error{constructor(public report:SegmentationReport){super('Product extraction failed. '+(report.attempts.at(-1)?.reason??'Upload and confirm a manual mask.'));}}
