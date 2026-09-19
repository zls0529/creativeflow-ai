import { refinementConfig } from '@/lib/providers';
import { apiError } from '@/lib/api';
export async function GET() {
  const selected=(value:string|undefined,allowed:string[])=>!value?'mock':allowed.includes(value)?value:'unsupported';
  try { return Response.json({ llm: selected(process.env.LLM_PROVIDER,['mock','openai']), image: selected(process.env.IMAGE_PROVIDER,['mock','comfyui']), vision: selected(process.env.VISION_PROVIDER,['mock','openai']), ...refinementConfig() }); }
  catch (e) { return apiError(e); }
}
