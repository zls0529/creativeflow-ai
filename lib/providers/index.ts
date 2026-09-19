import { MockLLMProvider } from './llm/mock';
import { OpenAILLMProvider } from './llm/openai';
import { ComfyUIProvider } from './image/comfyui';
import type { ImageGenerationProvider } from './image/base';
import { MockImageProvider } from './image/mock';
import { OpenAIVisionProvider } from './vision/openai';
import type { VisionProvider } from './vision/base';
import { MockVisionProvider } from './vision/mock';
import type {LLMProvider} from './llm/base';
export function getLLMProvider():LLMProvider {
  const name=process.env.LLM_PROVIDER||'mock';
  if(!['mock','openai'].includes(name))throw new Error(`Unsupported LLM_PROVIDER: ${name}`);
  return name==='openai'?new OpenAILLMProvider():new MockLLMProvider();
}
export function getVisionProvider():VisionProvider {
  const name=process.env.VISION_PROVIDER||'mock';
  if(!['mock','openai'].includes(name))throw new Error(`Vision provider "${name}" is not installed. Use mock or register a VisionProvider adapter.`);
  return name==='openai'?new OpenAIVisionProvider():new MockVisionProvider();
}
export function getImageProvider():ImageGenerationProvider {
 const name=process.env.IMAGE_PROVIDER||'mock';
 if(!['mock','comfyui'].includes(name))throw new Error('Unsupported image provider.');
 return name==='comfyui'?new ComfyUIProvider():new MockImageProvider();
}
export function getProviders() {
  const llm = process.env.LLM_PROVIDER || 'mock';
  const image = process.env.IMAGE_PROVIDER || 'mock';
  const vision = process.env.VISION_PROVIDER || 'mock';
  if (!['mock', 'openai'].includes(llm)) throw new Error(`Unsupported LLM_PROVIDER: ${llm}`);
  if (!['mock', 'comfyui'].includes(image)) throw new Error(`Image provider "${image}" is not installed. Use mock or register an ImageGenerationProvider adapter.`);
  if (!['mock','openai'].includes(vision)) throw new Error(`Vision provider "${vision}" is not installed. Use mock or register a VisionProvider adapter.`);
  return { llm: getLLMProvider(), image: getImageProvider(), vision: getVisionProvider() };
}
export type Providers = ReturnType<typeof getProviders>;
export function refinementConfig() {
  const threshold = Number(process.env.CRITIC_THRESHOLD || 80);
  const max = Number(process.env.MAX_REFINEMENTS || 2);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) throw new Error('CRITIC_THRESHOLD must be an integer from 0 to 100.');
  if (!Number.isInteger(max) || max < 0 || max > 2) throw new Error('MAX_REFINEMENTS must be 0, 1 or 2.');
  return { threshold, max };
}
