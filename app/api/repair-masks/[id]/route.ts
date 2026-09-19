import {storage} from '@/lib/storage';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Invalid mask',{status:400});return new Response(new Uint8Array(await storage.getRepairMask(id)),{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Mask unavailable',{status:404});}}
