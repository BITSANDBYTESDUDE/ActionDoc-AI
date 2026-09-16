import { z } from 'zod';
import { MAX_SUGGESTIONS } from '@/config/constants';

/**
 * Canonical schema for AI output.
 *
 * The model's response is *never* trusted: it is parsed with this schema before
 * anything reaches the database. Anything that fails validation is discarded
 * rather than coerced, so the UI only ever shows suggestions we can defend.
 *
 * The JSON Schema handed to OpenAI is derived from this zod definition, which
 * keeps the prompt contract and the runtime validation in one place.
 */

export const aiPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const aiActionTypeSchema = z.enum(['TASK', 'DECISION', 'FOLLOW_UP', 'DEADLINE', 'REMINDER']);

/** Normalise loose model output: blank strings become null, dates stay strings. */
const nullableText = (maxLength: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
    })
    .nullable();

export const aiSuggestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'A suggestion title is required.')
    .max(300)
    .transform((value) => value.replace(/\s+/g, ' ')),
  description: z
    .string()
    .trim()
    .max(4000)
    .default('')
    .transform((value) => value.replace(/\s+/g, ' ')),
  /** Name mentioned in the document, or null. Never invented. */
  assigneeName: nullableText(120),
  /** ISO 8601 date (YYYY-MM-DD or full timestamp) or null. */
  dueDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value.trim().length === 0 ? null : value.trim()))
    .nullable(),
  priority: aiPrioritySchema.default('MEDIUM'),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
  /** Verbatim quote from the document that justifies this suggestion. */
  evidence: z
    .string()
    .trim()
    .min(3, 'Evidence is required for every suggestion.')
    .max(2000),
  sourceLocation: nullableText(200),
  actionType: aiActionTypeSchema.default('TASK'),
});

export const aiExtractionResponseSchema = z.object({
  summary: z
    .string()
    .trim()
    .max(4000)
    .default('')
    .transform((value) => value.replace(/\s+/g, ' ')),
  actions: z.array(aiSuggestionSchema).max(MAX_SUGGESTIONS).default([]),
});

export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export type AiExtractionResponse = z.infer<typeof aiExtractionResponseSchema>;

/**
 * JSON Schema passed to OpenAI's structured-output mode. Kept deliberately in
 * sync with the zod schema above; `additionalProperties: false` and a full
 * `required` list are mandatory for strict structured outputs.
 */
export const aiExtractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'actions'],
  properties: {
    summary: {
      type: 'string',
      description: 'A concise 2-4 sentence summary of the document for a busy reader.',
    },
    actions: {
      type: 'array',
      maxItems: MAX_SUGGESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'description',
          'assigneeName',
          'dueDate',
          'priority',
          'confidence',
          'evidence',
          'sourceLocation',
          'actionType',
        ],
        properties: {
          title: { type: 'string', description: 'Concise imperative task title, max ~80 characters.' },
          description: { type: 'string', description: 'One or two sentences of useful context.' },
          assigneeName: {
            type: ['string', 'null'],
            description: 'Name exactly as written in the document, or null when not stated.',
          },
          dueDate: {
            type: ['string', 'null'],
            description: 'ISO 8601 date (YYYY-MM-DD) only when the document states a date, otherwise null.',
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          confidence: { type: 'number', description: 'Between 0 and 1.' },
          evidence: {
            type: 'string',
            description: 'A short verbatim quote from the document that supports this action.',
          },
          sourceLocation: {
            type: ['string', 'null'],
            description: 'Section heading, page number or paragraph reference when identifiable.',
          },
          actionType: { type: 'string', enum: ['TASK', 'DECISION', 'FOLLOW_UP', 'DEADLINE', 'REMINDER'] },
        },
      },
    },
  },
} as const;

/**
 * Validate raw model JSON. Invalid individual suggestions are dropped rather
 * than failing the whole extraction, but a completely malformed payload throws.
 */
export function parseAiExtractionResponse(raw: unknown): {
  parsed: AiExtractionResponse;
  droppedSuggestions: number;
} {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('AI response was not a JSON object.');
  }

  const record = raw as Record<string, unknown>;
  const candidateActions = Array.isArray(record.actions) ? record.actions : [];
  const validActions: AiSuggestion[] = [];
  let droppedSuggestions = 0;

  for (const candidate of candidateActions) {
    const result = aiSuggestionSchema.safeParse(candidate);
    if (result.success) {
      validActions.push(result.data);
    } else {
      droppedSuggestions += 1;
    }
  }

  const parsed = aiExtractionResponseSchema.parse({
    summary: typeof record.summary === 'string' ? record.summary : '',
    actions: validActions,
  });

  return { parsed, droppedSuggestions };
}