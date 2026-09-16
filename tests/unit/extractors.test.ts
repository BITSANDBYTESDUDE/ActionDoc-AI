import { describe, expect, it } from 'vitest';
import { PdfTextExtractor } from '@/lib/documents/pdf.extractor';
import { DocxTextExtractor } from '@/lib/documents/docx.extractor';
import { ValidationError } from '@/lib/errors';
import {
  buildCorruptPdf,
  buildDocx,
  buildMultiPagePdf,
  buildPdf,
  docxBody,
} from '../fixtures/documents';

const pdf = new PdfTextExtractor();
const docx = new DocxTextExtractor();

describe('PdfTextExtractor', () => {
  it('extracts the text layer from a real PDF', async () => {
    const result = await pdf.extract(buildPdf('Hello ActionDoc'));

    expect(result.text).toContain('Hello ActionDoc');
    expect(result.pageCount).toBe(1);
    expect(result.extractionMethod).toBe('pdfjs/text-layer');
    expect(result.warnings).toEqual([]);
  });

  it('counts pages from the document structure, not from the input', async () => {
    const result = await pdf.extract(buildMultiPagePdf(['First page', 'Second page', 'Third page']));

    expect(result.pageCount).toBe(3);
    expect(result.text).toContain('First page');
    expect(result.text).toContain('Second page');
    expect(result.text).toContain('Third page');
  });

  it('rejects an empty file before reaching the parser', async () => {
    await expect(pdf.extract(new Uint8Array(0))).rejects.toThrow(ValidationError);
    await expect(pdf.extract(new Uint8Array(0))).rejects.toThrow(/empty/i);
  });

  it('reports a corrupt PDF as a ValidationError rather than leaking a parser error', async () => {
    await expect(pdf.extract(buildCorruptPdf())).rejects.toThrow(ValidationError);
    await expect(pdf.extract(buildCorruptPdf())).rejects.toThrow(/could not be read/i);
  });

  it('rejects bytes that are not a PDF at all', async () => {
    const notAPdf = new TextEncoder().encode('just some plain text, no header');
    await expect(pdf.extract(notAPdf)).rejects.toThrow(ValidationError);
  });

  it('only claims support for PDF', () => {
    expect(pdf.supports('PDF')).toBe(true);
    expect(pdf.supports('DOCX')).toBe(false);
    expect(pdf.supports('TXT')).toBe(false);
  });

  it('returns normalized text without stray control characters', async () => {
    const result = await pdf.extract(buildPdf('Ship the report'));

    expect(result.text).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    expect(result.text.trim()).toBe(result.text);
  });
});

describe('DocxTextExtractor', () => {
  it('extracts paragraphs from a real DOCX', async () => {
    const bytes = await buildDocx(
      docxBody([
        { text: 'Ali will draft the spec by Friday.' },
        { text: 'Omar owns the client review.' },
      ]),
    );

    const result = await docx.extract(bytes);

    expect(result.text).toContain('Ali will draft the spec by Friday.');
    expect(result.text).toContain('Omar owns the client review.');
    expect(result.extractionMethod).toBe('mammoth/html');
  });

  it('preserves heading structure as markers', async () => {
    const bytes = await buildDocx(
      docxBody([
        { text: 'Kickoff', style: 'Heading1' },
        { text: 'Body text here.' },
      ]),
    );

    const result = await docx.extract(bytes);
    // mammoth renders headings as markdown-ish hashes, which survive into text.
    expect(result.text).toContain('# Kickoff');
  });

  it('normalizes runs of whitespace between words', async () => {
    const bytes = await buildDocx(
      docxBody([{ text: 'Second   paragraph with   extra spaces.' }]),
    );

    const result = await docx.extract(bytes);
    expect(result.text).toContain('Second paragraph with extra spaces.');
    expect(result.text).not.toMatch(/ {2,}/);
  });

  it('rejects an empty DOCX file', async () => {
    await expect(docx.extract(new Uint8Array(0))).rejects.toThrow(ValidationError);
    await expect(docx.extract(new Uint8Array(0))).rejects.toThrow(/empty/i);
  });

  it('reports a malformed DOCX as a ValidationError', async () => {
    const notAZip = new TextEncoder().encode('PK this is not actually a zip archive');

    await expect(docx.extract(notAZip)).rejects.toThrow(ValidationError);
    await expect(docx.extract(notAZip)).rejects.toThrow(/could not be read/i);
  });

  it('only claims support for DOCX', () => {
    expect(docx.supports('DOCX')).toBe(true);
    expect(docx.supports('PDF')).toBe(false);
    expect(docx.supports('TXT')).toBe(false);
  });

  it('records extractor warnings instead of failing the upload', async () => {
    // Referencing an undefined style is exactly what Word does when a document
    // is produced by a different template - mammoth warns, we must not throw.
    const bytes = await buildDocx(docxBody([{ text: 'Content', style: 'Heading1' }]));

    const result = await docx.extract(bytes);
    expect(result.text).toContain('Content');
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});