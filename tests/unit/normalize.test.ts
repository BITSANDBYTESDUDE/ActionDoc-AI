import { describe, expect, it } from 'vitest';
import { chunkDocumentText, countWords, normalizeDocumentText } from '@/lib/documents/normalize';

describe('normalizeDocumentText', () => {
  it('normalises line endings and collapses runs of horizontal whitespace', () => {
    const result = normalizeDocumentText('Alpha   beta\r\nGamma\t\tdelta\rEpsilon');
    expect(result.text).toBe('Alpha beta\nGamma delta\nEpsilon');
  });

  it('preserves paragraph breaks but collapses three or more newlines', () => {
    const result = normalizeDocumentText('First paragraph.\n\n\n\n\nSecond paragraph.');
    expect(result.text).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('joins words hyphenated across a line break', () => {
    const result = normalizeDocumentText('This is action-\nable work.');
    expect(result.text).toBe('This is actionable work.');
  });

  it('replaces typographic quotes, dashes and ellipses with ASCII equivalents', () => {
    const result = normalizeDocumentText('\u201cOn track\u201d \u2014 really\u2026');
    expect(result.text).toBe('"On track" - really...');
  });

  it('strips zero-width characters, soft hyphens and non-breaking spaces', () => {
    const result = normalizeDocumentText('a\u200bb\u00adc\u00a0d\ufeff');
    expect(result.text).toBe('abc d');
  });

  it('removes control characters and folds tabs into a single space', () => {
    const result = normalizeDocumentText('a\u0000b\u0007c\td\ne');
    expect(result.text).toBe('abc d\ne');
    expect(result.removedControlCharacters).toBe(2);
  });

  it('reports the original length and does not truncate small inputs', () => {
    const input = 'A short document.';
    const result = normalizeDocumentText(input);
    expect(result.originalLength).toBe(input.length);
    expect(result.truncated).toBe(false);
  });

  it('truncates oversized input on a paragraph boundary and flags it', () => {
    const paragraph = 'x'.repeat(50);
    const input = Array.from({ length: 40 }, () => paragraph).join('\n\n');
    const result = normalizeDocumentText(input, { maxChars: 400 });

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(400);
    // Cut on a paragraph boundary, so no partial paragraph is left behind.
    expect(result.text.split('\n\n').every((part) => part === paragraph)).toBe(true);
  });

  it('drops blank lines entirely when paragraph preservation is disabled', () => {
    const result = normalizeDocumentText('a\n\n\nb', { preserveParagraphs: false });
    expect(result.text).toBe('a\nb');
  });

  it('is idempotent', () => {
    const once = normalizeDocumentText('Alpha  beta\r\n\r\n\r\nGamma-\ndelta').text;
    const twice = normalizeDocumentText(once).text;
    expect(twice).toBe(once);
  });
});

describe('countWords', () => {
  it('counts word-like tokens across unicode text', () => {
    expect(countWords('Ship the Zurich report by Friday.')).toBe(6);
  });

  it('returns zero for whitespace-only input', () => {
    expect(countWords('   \n  ')).toBe(0);
  });
});

describe('chunkDocumentText', () => {
  it('returns the text unchanged when it fits in one chunk', () => {
    expect(chunkDocumentText('short text', 100)).toEqual(['short text']);
  });

  it('splits on paragraph boundaries and keeps every paragraph', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph number ${i} with some content.`);
    const chunks = chunkDocumentText(paragraphs.join('\n\n'), 120);
    const joined = chunks.join('\n\n');
    for (const paragraph of paragraphs) {
      expect(joined).toContain(paragraph);
    }
  });

  it('hard-splits a paragraph that is larger than the chunk size', () => {
    const chunks = chunkDocumentText('y'.repeat(1000), 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true);
    expect(chunks.join('').split('y').join('').length).toBe(0);
  });
});
