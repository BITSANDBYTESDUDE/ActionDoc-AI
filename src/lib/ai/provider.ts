/**
 * Provider abstraction for text-generation models.
 *
 * The rest of the application depends only on this interface, so swapping
 * OpenAI for another provider (or a local model) is a single-file change. No
 * other module in the codebase imports the OpenAI SDK directly.
 */
export interface GenerateStructuredInput {
  system: string;
  user: string;
  /** JSON Schema describing the required response shape. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface GenerateStructuredResult {
  /** Raw JSON value returned by the model - still untrusted, must be validated. */
  raw: unknown;
  model: string;
  usage: TokenUsage;
  durationMs: number;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  readonly isConfigured: boolean;
  generateStructured(input: GenerateStructuredInput): Promise<GenerateStructuredResult>;
}

export type { TokenUsage as GenerationTokenUsage };