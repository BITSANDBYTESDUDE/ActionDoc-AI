import { DocxTextExtractor } from '@/lib/documents/docx.extractor';
import { PdfTextExtractor } from '@/lib/documents/pdf.extractor';
import { PlainTextExtractor } from '@/lib/documents/text.extractor';
import { UnsupportedMediaTypeError } from '@/lib/errors';
import type { DocumentSourceType, ExtractionResult, TextExtractor } from '@/types/documents';

/**
 * Registry of extractors. Adding OCR later means registering an extractor that
 * supports PDF and runs the text-layer extractor first (see the roadmap).
 */
const extractors: TextExtractor[] = [
  new PdfTextExtractor(),
  new DocxTextExtractor(),
  new PlainTextExtractor(),
];

export function resolveExtractor(sourceType: DocumentSourceType): TextExtractor {
  const extractor = extractors.find((candidate) => candidate.supports(sourceType));
  if (!extractor) {
    throw new UnsupportedMediaTypeError(`No text extractor is available for ${sourceType} files.`);
  }
  return extractor;
}

/**
 * Single entry point used by the processing pipeline. Every supported format
 * returns the same shape, so the rest of the pipeline is format agnostic.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  sourceType: DocumentSourceType,
): Promise<ExtractionResult> {
  const extractor = resolveExtractor(sourceType);
  return extractor.extract(bytes);
}

export { PdfTextExtractor, DocxTextExtractor, PlainTextExtractor };