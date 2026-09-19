import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
const root = path.join(process.cwd(), 'storage', 'uploads');
function filePath(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid file identifier.');
  return path.join(root, id);
}
const generatedRoot = path.join(process.cwd(), 'storage', 'generated');
const repairMaskRoot=path.join(process.cwd(),'storage','repair-masks');
function repairMaskPath(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid mask identifier.');return path.join(repairMaskRoot,id+'.png');}
function generatedPath(id: string) {
  if (!/^[a-f0-9-]{36}\.png$/.test(id)) throw new Error('Invalid generated image identifier.');
  return path.join(generatedRoot, id);
}
export const storage = {
  async putRepairMask(id:string,bytes:Buffer){await mkdir(repairMaskRoot,{recursive:true});await writeFile(repairMaskPath(id),bytes,{flag:'wx'});},
  async getRepairMask(id:string){return readFile(repairMaskPath(id));},
  async removeRepairMask(id:string){await unlink(repairMaskPath(id));},
  async putGenerated(id: string, bytes: Buffer) { const target = generatedPath(id); await mkdir(generatedRoot, { recursive: true }); await writeFile(target, bytes, { flag: 'wx' }); },
  async getGenerated(id: string) { return readFile(generatedPath(id)); },
  async removeGenerated(id: string) { await unlink(generatedPath(id)); },
  async put(id: string, bytes: Buffer) { await mkdir(root, { recursive: true }); await writeFile(filePath(id), bytes); },
  async get(id: string) { return readFile(filePath(id)); },
  async remove(id: string) { await unlink(filePath(id)).catch(() => {}); }
};
export function detectMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
  return null;
}
