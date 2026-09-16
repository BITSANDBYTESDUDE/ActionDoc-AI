import JSZip from 'jszip';

/**
 * Byte-level fixtures for extractor tests.
 *
 * Everything here is built in-process rather than loaded from disk so the tests
 * exercise the real parsers (pdf.js, mammoth) against real file structures - a
 * mocked parser would prove nothing about malformed-input handling.
 */

/**
 * Minimal but spec-valid single-page PDF with a real text object and an xref
 * table. pdf.js can still resolve documents without a usable xref ("Indexing
 * all PDF objects"), so the offsets are kept correct to avoid depending on that
 * recovery path.
 */
export function buildPdf(text: string): Uint8Array {
  const content = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  return assemblePdf(objects);
}

/** Same builder with multiple pages, to prove page counting rather than assume it. */
export function buildMultiPagePdf(pages: string[]): Uint8Array {
  const contents = pages.map((text) => `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`);
  // Object layout: 1 = catalog, 2 = pages, then one page object per page, then
  // the shared font, then one content stream per page.
  const firstPageId = 3;
  const fontId = firstPageId + pages.length;
  const firstContentId = fontId + 1;

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages
      .map((_, index) => `${firstPageId + index} 0 R`)
      .join(' ')}] /Count ${pages.length} >>`,
  ];
  pages.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${
        firstContentId + index
      } 0 R >>`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  contents.forEach((content) => {
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  return assemblePdf(objects);
}

function assemblePdf(objects: string[]): Uint8Array {
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/**
 * A PDF whose header and trailer look right but whose body is garbage. This is
 * the realistic "corrupt upload" case - it must surface as a ValidationError,
 * not a raw parser exception.
 */
export function buildCorruptPdf(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\nthis is not a real pdf at all\n%%EOF');
}

/** Minimal valid DOCX (OPC zip) wrapping the given `word/document.xml` body. */
export function buildDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file('word/document.xml', bodyXml);
  return zip.generateAsync({ type: 'uint8array' });
}

/** Builds a `word/document.xml` document from styled paragraph texts. */
export function docxBody(paragraphs: { text: string; style?: string }[]): string {
  const body = paragraphs
    .map(({ text, style }) => {
      const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
      return `<w:p>${props}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}
