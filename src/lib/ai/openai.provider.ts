import OpenAI from 'openai';
import { ExternalServiceError } from '@/lib/errors';
import { sleep } from '@/lib/utils';
import type {
  GenerateStructuredInput,
  GenerateStructuredResult,
  TextGenerationProvider,
} from '@/lib/ai/provider';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

/** Errors worth retrying: rate limits, upstream 5xx and network blips. */
function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return true;
    if (typeof error.status === 'number' && error.status >= 500) return true;
    return false;
  }
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return true;
  return false;
}

export class OpenAiProvider implements TextGenerationProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly isConfigured = true;
  private readonly client: OpenAI;
  private readonly timeoutMs: number;

  constructor(config: { apiKey: string; model: string; timeoutMs: number }) {
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: 0, // retries are handled here so backoff is explicit and logged
    });
  }

  async generateStructured(input: GenerateStructuredInput): Promise<GenerateStructuredResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: input.temperature ?? 0.1,
          max_completion_tokens: input.maxOutputTokens ?? 4096,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.jsonSchema,
            },
          },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new ExternalServiceError('openai', 'The AI provider returned an empty response.', {
            model: this.model,
          });
        }

        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch {
          throw new ExternalServiceError('openai', 'The AI provider returned malformed JSON.', {
            model: this.model,
            preview: content.slice(0, 200),
          });
        }

        return {
          raw,
          model: this.model,
          usage: {
            promptTokens: completion.usage?.prompt_tokens ?? null,
            completionTokens: completion.usage?.completion_tokens ?? null,
            totalTokens: completion.usage?.total_tokens ?? null,
          },
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        lastError = error;

        if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break;

        const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250;
        console.warn('[ai] retrying provider call', {
          attempt,
          model: this.model,
          reason: error instanceof Error ? error.message : String(error),
        });
        await sleep(delay);
      }
    }

    if (lastError instanceof ExternalServiceError) throw lastError;

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    if (lastError instanceof OpenAI.APIError && lastError.status === 401) {
      throw new ExternalServiceError('openai', 'The AI provider rejected our credentials.', {
        model: this.model,
      });
    }
    if (lastError instanceof OpenAI.APIConnectionTimeoutError) {
      throw new ExternalServiceError('openai', 'The AI provider request timed out.', {
        model: this.model,
        timeoutMs: this.timeoutMs,
      });
    }
    throw new ExternalServiceError('openai', `The AI provider request failed: ${message.slice(0, 200)}`, {
      model: this.model,
    });
  }
}