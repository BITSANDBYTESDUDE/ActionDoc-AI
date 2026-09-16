/**
 * Text normalisation for extracted documents.
 *
 * Goals, in priority order:
 *  1. Never lose meaningful content.
 *  2. Produce stable input for the AI (consistent whitespace, no artefacts).
 *  3. Bound the size of the text we hand to the model.
 */
import { MAX_EXTRACTED_TEXT_CHARS } from '@/config/constants';

export interface NormalizeOptions {
  maxChars?: number;
  /** Collapse 3+ blank lines into a single paragraph break. */
  preserveParagraphs?: boolean;
}

export interface NormalizeResult {
  text: string;
  truncated: boolean;
  originalLength: number;
  removedControlCharacters: number;
}

/** Characters that commonly survive PDF extraction but carry no meaning. */
const ARTEFACT_PATTERNS: [RegExp, string][] = [
  [/\u00a0/g, ' '], // non-breaking space
  [/\u200b|\u200c|\u200d|\ufeff/g, ''], // zero-width characters
  [/\u00ad/g, ''], // soft hyphen
  [/[\u2018\u2019\u201b]/g, "'"],
  [/[\u201c\u201d\u201f]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u2022|\u25cf|\u25aa/g, '-'], // bullet glyphs
];

export function normalizeDocumentText(input: string, options: NormalizeOptions = {}): NormalizeResult {
  const maxChars = options.maxChars ?? MAX_EXTRACTED_TEXT_CHARS;
  const preserveParagraphs = options.preserveParagraphs ?? true;
  const originalLength = input.length;

  let removedControlCharacters = 0;
  let text = input;

  // Strip control characters except tab, newline and carriage return.
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, () => {
    removedControlCharacters += 1;
    return '';
  });

  for (const [pattern, replacement] of ARTEFACT_PATTERNS) {
    text = text.replace(pattern, replacement);
  }

  // Normalise line endings, then horizontal whitespace.
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/ ?\n ?/g, '\n');

  if (preserveParagraphs) {
    // Collapse runs of blank lines but keep a single visual break.
    text = text.replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\n{2,}/g, '\n');
  }

  // Remove hyphenation artefacts at line ends: "action-\nable" -> "actionable"
  text = text.replace(/([a-z])-\n([a-z])/g, '$1$2');

  text = text.trim();

  let truncated = false;
  if (text.length > maxChars) {
    // Cut on a paragraph boundary when one is close to the limit.
    const slice = text.slice(0, maxChars);
    const lastBreak = slice.lastIndexOf('\n\n');
    text = lastBreak > maxChars * 0.6 ? slice.slice(0, lastBreak) : slice;
    truncated = true;
  }

  return { text, truncated, originalLength, removedControlCharacters };
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}'-]+/gu);
  return matches ? matches.length : 0;
}

/**
 * Split text into overlapping chunks that respect paragraph boundaries. Used
 * when a document is too large for a single model call.
 */
export function chunkDocumentText(text: string, maxChunkChars: number, overlapChars = 400): string[] {
  if (text.length <= maxChunkChars) return [text];

  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      // Hard-split an oversized paragraph.
      for (let i = 0; i < paragraph.length; i += maxChunkChars - overlapChars) {
        chunks.push(paragraph.slice(i, i + maxChunkChars));
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > maxChunkChars) {
      chunks.push(current);
      const tail = current.slice(-overlapChars);
      current = `${tail}\n\n${paragraph}`;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}