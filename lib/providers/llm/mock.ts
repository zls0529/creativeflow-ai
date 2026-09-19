import {measure,operationFor} from '@/lib/usage/capture';
import type { LLMProvider, StructuredRequest } from './base';
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  async generate<T>(request: StructuredRequest<T>): Promise<T> { return measure('mock','text',operationFor(request.name),null,async()=>request.schema.parse(request.mock())); }
}
