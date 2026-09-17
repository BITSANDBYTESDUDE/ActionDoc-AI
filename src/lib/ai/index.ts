import { ExternalServiceError } from '@/lib/errors';
import { OpenAiProvider } from '@/lib/ai/openai.provider';
import { MockAiProvider } from '@/lib/ai/mock.provider';
import type { TextGenerationProvider } from '@/lib/ai/provider';

class UnconfiguredProvider implements TextGenerationProvider {
  readonly name = 'unconfigured';
  readonly model = 'none';
  readonly isConfigured = false;
  async generateStructured(): Promise<never> {
    throw new ExternalServiceError(
      'openai',
      'AI analysis is not configured. Set OPENAI_API_KEY to enable document analysis.',
    );
  }
}

let cached: TextGenerationProvider | null = null;

export function getGenerationProvider(): TextGenerationProvider {
  if (cached) return cached;

  if (process.env.ENABLE_MOCK_AI === 'true') {
    cached = new MockAiProvider();
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-replace-me') {
    cached = new UnconfiguredProvider();
    return cached;
  }

  cached = new OpenAiProvider({
    apiKey,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000),
  });
  return cached;
}

export function resetGenerationProviderCache() {
  cached = null;
}

/**
 * Non-throwing view of the AI configuration, used by the settings page and
 * health checks so operators can see whether analysis is wired up.
 */
export function getAiConfigurationStatus(): { configured: boolean; provider: string; model: string } {
  const provider = getGenerationProvider();
  return {
    configured: provider.isConfigured,
    provider: provider.name,
    model: provider.model,
  };
}