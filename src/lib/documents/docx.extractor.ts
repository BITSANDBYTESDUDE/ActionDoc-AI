import mammoth from 'mammoth';
import { normalizeDocumentText } from '@/lib/documents/normalize';
import { ValidationError } from '@/lib/errors';
import type { ExtractionResult, TextExtractor } from '@/types/documents';

/**
 * DOCX extraction via mammoth.
 *
 * `convertToHtml` is used rather than `extractRawText` so that headings and list
 * structure survive as markers; the HTML is then reduced to plain text. This
 * gives the AI cleaner section boundaries than raw text would.
 */
export class DocxTextExtractor implements TextExtractor {
  readonly name = 'mammoth';

  supports(sourceType: string): boolean {
    return sourceType === 'DOCX';
  }

  async extract(bytes: Uint8Array): Promise<ExtractionResult> {
    const warnings: string[] = [];

    if (bytes.byteLength === 0) {
      throw new ValidationError('The DOCX file is empty.');
    }

    let html: string;
    try {
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      html = result.value;
      for (const message of result.messages) {
        if (message.type === 'warning' || message.type === 'error') {
          warnings.push(`${message.type}: ${message.message}`.slice(0, 300));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`The DOCX file could not be read: ${message.slice(0, 200)}`);
    }

    const plainText = htmlToPlainText(html);
    const normalised = normalizeDocumentText(plainText, { preserveParagraphs: true });

    if (normalised.text.trim().length === 0) {
      warnings.push('No readable text was found in this document.');
    }
    if (normalised.truncated) {
      warnings.push('The extracted text was truncated to stay within processing limits.');
    }

    return {
      text: normalised.text,
      // DOCX has no reliable page count without a rendering engine.
      pageCount: null,
      extractionMethod: 'mammoth/html',
      warnings: warnings.slice(0, 20),
    };
  }
}

/** Convert the mammoth HTML subset into readable plain text. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\s*h[1-6][^>]*>/gi, '\n\n### ')
    .replace(/<\s*td[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}