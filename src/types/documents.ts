export type DocumentSourceType = 'PDF' | 'DOCX' | 'TXT' | 'MARKDOWN';

export interface ExtractionResult {
  text: string;
  pageCount: number | null;
  extractionMethod: string;
  warnings: string[];
}

export interface TextExtractor {
  readonly name: string;
  supports(sourceType: DocumentSourceType): boolean;
  extract(bytes: Uint8Array): Promise<ExtractionResult>;
}