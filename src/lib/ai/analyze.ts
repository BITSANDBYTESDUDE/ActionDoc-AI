import { MAX_SUGGESTIONS } from '@/config/constants';
import { getGenerationProvider } from '@/lib/ai';
import { chunkDocumentText } from '@/lib/documents/normalize';
import { getCurrentExtractionPrompt } from '@/lib/ai/prompts';
import { aiExtractionJsonSchema, parseAiExtractionResponse, type AiSuggestion } from '@/lib/ai/schema';
import type { TokenUsage } from '@/lib/ai/provider';

export interface AnalyzeDocumentInput {
  documentId: string;
  documentName: string;
  text: string;
}

export interface AnalyzeDocumentResult {
  summary: string;
  suggestions: AiSuggestion[];
  model: string;
  promptVersion: string;
  usage: TokenUsage;
  durationMs: number;
  /** Suggestions the model returned that failed schema validation. */
  droppedSuggestions: number;
  warnings: string[];
}

const MAX_INPUT_CHARS = 48_000;
/** Above this we chunk the document and merge results. */
const CHUNK_TRIGGER_CHARS = 40_000;

/**
 * Analyse a document and return validated, grounded suggestions.
 *
 * The raw model output never leaves this function unvalidated: everything
 * returned has passed `aiSuggestionSchema`.
 */
export async function analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult> {
  const provider = getGenerationProvider();
  const prompt = getCurrentExtractionPrompt();
  const warnings: string[] = [];
  const text = input.text.trim();

  // Check the text before the provider: a document with nothing to read does
  // not need the AI, and must not be marked FAILED just because the provider is
  // unconfigured. It belongs in human review instead.
  if (text.length === 0) {
    return {
      summary: 'No readable text was found in this document, so it could not be analysed.',
      suggestions: [],
      model: provider.isConfigured ? provider.model : 'none',
      promptVersion: prompt.version,
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
      durationMs: 0,
      droppedSuggestions: 0,
      warnings: ['The document contained no extractable text.'],
    };
  }

  if (!provider.isConfigured) {
    throw new Error(
      'AI analysis is not configured. Set OPENAI_API_KEY to enable document analysis.',
    );
  }

  const chunks =
    text.length > CHUNK_TRIGGER_CHARS ? chunkDocumentText(text, MAX_INPUT_CHARS) : [text];

  if (chunks.length > 1) {
    warnings.push(
      `The document was analysed in ${chunks.length} parts; suggestions were merged and de-duplicated.`,
    );
  }

  const collected: AiSuggestion[] = [];
  const summaryParts: string[] = [];
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let droppedSuggestions = 0;
  let durationMs = 0;

  for (const [index, chunk] of chunks.entries()) {
    const result = await provider.generateStructured({
      system: prompt.system,
      user: prompt.buildUserPrompt({
        documentText: chunk,
        documentName: chunks.length > 1 ? `${input.documentName} (part ${index + 1} of ${chunks.length})` : input.documentName,
        today: new Date().toISOString().slice(0, 10),
      }),
      jsonSchema: aiExtractionJsonSchema as unknown as Record<string, unknown>,
      schemaName: 'actiondoc_extraction',
      temperature: 0.1,
    });

    durationMs += result.durationMs;
    usage.promptTokens = (usage.promptTokens ?? 0) + (result.usage.promptTokens ?? 0);
    usage.completionTokens = (usage.completionTokens ?? 0) + (result.usage.completionTokens ?? 0);
    usage.totalTokens = (usage.totalTokens ?? 0) + (result.usage.totalTokens ?? 0);

    const { parsed, droppedSuggestions: dropped } = parseAiExtractionResponse(result.raw);
    droppedSuggestions += dropped;
    collected.push(...parsed.actions);
    if (parsed.summary) summaryParts.push(parsed.summary);
  }

  const deduped = dedupeSuggestions(collected);

  if (deduped.length < collected.length) {
    warnings.push(
      `${collected.length - deduped.length} duplicate suggestion(s) were removed before review.`,
    );
  }
  if (droppedSuggestions > 0) {
    warnings.push(
      `${droppedSuggestions} suggestion(s) returned by the model did not meet the required schema and were discarded.`,
    );
  }
  if (deduped.length === 0) {
    warnings.push('No actionable items were identified in this document.');
  }

  return {
    summary: summaryParts.join(' ').slice(0, 4000),
    suggestions: deduped.slice(0, MAX_SUGGESTIONS),
    model: provider.model,
    promptVersion: prompt.version,
    usage,
    durationMs,
    droppedSuggestions,
    warnings,
  };
}

/** Normalise a title so near-identical titles collapse together. */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove duplicate and near-duplicate suggestions, keeping the highest
 * confidence instance of each.
 */
export function dedupeSuggestions(suggestions: AiSuggestion[]): AiSuggestion[] {
  const byKey = new Map<string, AiSuggestion>();

  for (const suggestion of suggestions) {
    const key = normaliseTitle(suggestion.title);
    if (key.length === 0) continue;

    const existing = byKey.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      byKey.set(key, suggestion);
    }
  }

  return [...byKey.values()];
}

/** Resolve an AI-provided due date string into a Date, or null when unusable. */
export function parseAiDueDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  // Reject implausible dates (a common hallucination signal).
  const year = parsed.getUTCFullYear();
  if (year < 1970 || year > 2200) return null;

  return parsed;
}