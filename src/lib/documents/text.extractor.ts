import { normalizeDocumentText } from '@/lib/documents/normalize';
import { ValidationError } from '@/lib/errors';
import type { ExtractionResult, TextExtractor } from '@/types/documents';

/** Plain text and Markdown extraction. */
export class PlainTextExtractor implements TextExtractor {
  readonly name = 'plain-text';

  supports(sourceType: string): boolean {
    return sourceType === 'TXT' || sourceType === 'MARKDOWN';
  }

  async extract(bytes: Uint8Array): Promise<ExtractionResult> {
    if (bytes.byteLength === 0) {
      throw new ValidationError('The text file is empty.');
    }

    const decoded = decodeText(bytes);
    const normalised = normalizeDocumentText(decoded.text, { preserveParagraphs: true });

    const warnings: string[] = [];
    if (decoded.encodingFallback) {
      warnings.push('The file was not valid UTF-8 and was decoded as Latin-1.');
    }
    if (normalised.text.trim().length === 0) {
      warnings.push('The file contains no readable text.');
    }
    if (normalised.truncated) {
      warnings.push('The text was truncated to stay within processing limits.');
    }

    return {
      text: normalised.text,
      pageCount: null,
      extractionMethod: 'text/decode',
      warnings,
    };
  }
}

/**
 * Decode bytes as UTF-8, falling back to Latin-1 for legacy files. A BOM is
 * stripped when present so it never reaches the model.
 */
export function decodeText(bytes: Uint8Array): { text: string; encodingFallback: boolean } {
  const withoutBom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return { text: decoder.decode(withoutBom), encodingFallback: false };
  } catch {
    const decoder = new TextDecoder('latin1');
    return { text: decoder.decode(withoutBom), encodingFallback: true };
  }
}