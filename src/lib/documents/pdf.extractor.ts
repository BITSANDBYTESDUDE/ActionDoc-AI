import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { normalizeDocumentText } from '@/lib/documents/normalize';
import { UnsupportedMediaTypeError, ValidationError } from '@/lib/errors';
import type { ExtractionResult, TextExtractor } from '@/types/documents';

/**
 * Real PDF text extraction backed by pdf.js (via unpdf, which ships a
 * serverless-friendly build).
 *
 * OCR is intentionally out of scope for the MVP: a scanned PDF with no text
 * layer returns an empty string plus a warning, and the architecture leaves
 * room for an OCR stage later (see `extractionMethod`).
 */
export class PdfTextExtractor implements TextExtractor {
  readonly name = 'pdfjs';

  supports(sourceType: string): boolean {
    return sourceType === 'PDF';
  }

  async extract(bytes: Uint8Array): Promise<ExtractionResult> {
    const warnings: string[] = [];

    if (bytes.byteLength === 0) {
      throw new ValidationError('The PDF file is empty.');
    }

    let pageCount: number | null = null;

    try {
      const pdf = await getDocumentProxy(bytes);
      pageCount = pdf.numPages;

      if (pageCount === 0) {
        return {
          text: '',
          pageCount: 0,
          extractionMethod: 'pdfjs/text-layer',
          warnings: ['The PDF contains no pages.'],
        };
      }

      const { text, totalPages } = await extractPdfText(pdf, { mergePages: true });
      pageCount = typeof totalPages === 'number' ? totalPages : pageCount;

      const normalised = normalizeDocumentText(typeof text === 'string' ? text : String(text ?? ''), {
        preserveParagraphs: true,
      });

      if (normalised.text.trim().length === 0) {
        warnings.push(
          'No embedded text layer was found. This PDF is most likely a scan and requires OCR, which is not enabled yet.',
        );
        return { text: '', pageCount, extractionMethod: 'pdfjs/text-layer', warnings };
      }

      if (normalised.truncated) {
        warnings.push('The extracted text was truncated to stay within processing limits.');
      }

      // Surface a garbled-encoding signal: pdf.js returns replacement chars for
      // fonts it cannot map to Unicode (common in older/embedded-font PDFs).
      const replacementCount = (normalised.text.match(/\uFFFD/g) ?? []).length;
      if (replacementCount > normalised.text.length * 0.02) {
        warnings.push(
          'A significant number of characters could not be decoded, which often indicates an embedded font issue.',
        );
      }

      return { text: normalised.text, pageCount, extractionMethod: 'pdfjs/text-layer', warnings };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/password/i.test(message)) {
        throw new UnsupportedMediaTypeError('Password-protected PDFs are not supported.');
      }
      throw new ValidationError(`The PDF could not be read: ${message.slice(0, 200)}`);
    }
  }
}