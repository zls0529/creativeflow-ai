import 'server-only';
import type { LLMProvider, StructuredRequest } from './base';
import { openAIConfiguration, structuredResponse } from '../openai/responses';
export { OpenAIProviderError, type OpenAIErrorCode } from '../openai/responses';
export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';
  constructor() { openAIConfiguration(); }
  generate<T>(request: StructuredRequest<T>): Promise<T> {
    return structuredResponse({ ...request, input: request.images?.length ? [{role:'user',content:[{type:'input_text',text:JSON.stringify(request.context)},...request.images.map(image_url=>({type:'input_image',image_url,detail:'high'}))]}] : JSON.stringify(request.context) }, openAIConfiguration());
  }
}
