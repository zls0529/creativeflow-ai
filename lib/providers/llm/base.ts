import type { z } from 'zod';
export interface StructuredRequest<T> { name: string; instruction: string; context: unknown; images?: string[]; schema: z.ZodType<T>; mock: () => T }
export interface LLMProvider { readonly name: string; generate<T>(request: StructuredRequest<T>): Promise<T> }
