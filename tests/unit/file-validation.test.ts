import { describe, expect, it } from 'vitest';
import {
  buildStorageKey,
  detectSourceType,
  hashFileBytes,
  isAllowedStorageKey,
  sanitizeFileName,
  validateUpload,
  verifyFileSignature,
} from '@/lib/storage/keys';
import {
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '@/lib/errors';
import { PlainTextExtractor, decodeText } from '@/lib/documents/text.extractor';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25]);
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const TXT_BYTES = new TextEncoder().encode('Agenda\n\n- Ship the report\n');

describe('sanitizeFileName', () => {
  it('strips directory traversal and path separators', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Windows\\System32\\evil.txt')).toBe('evil.txt');
    expect(sanitizeFileName('a/b/c/report.pdf')).toBe('report.pdf');
  });

  it('removes control characters and reserved characters', () => {
    expect(sanitizeFileName('re\u0000port\u0007.pdf')).toBe('report.pdf');
    expect(sanitizeFileName('report<>:"|?*.pdf')).toBe('report-.pdf');
  });

  it('collapses whitespace and strips leading dots', () => {
    expect(sanitizeFileName('   my    report   .pdf  ')).toBe('my report .pdf');
    expect(sanitizeFileName('...hidden.txt')).toBe('hidden.txt');
  });

  it('falls back to a placeholder for unusable names and caps the length', () => {
    expect(sanitizeFileName('...')).toBe('document');
    expect(sanitizeFileName('a'.repeat(500)).length).toBe(180);
  });
});

describe('detectSourceType', () => {
  it('accepts matching extension and mime type', () => {
    expect(detectSourceType('a.pdf', 'application/pdf')).toBe('PDF');
    expect(detectSourceType('a.txt', 'text/plain')).toBe('TXT');
    expect(
      detectSourceType(
        'a.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('DOCX');
  });

  it('rejects an unsupported extension', () => {
    expect(() => detectSourceType('a.exe', 'application/pdf')).toThrow(UnsupportedMediaTypeError);
  });

  it('rejects a spoofed extension/mime combination', () => {
    expect(() => detectSourceType('a.pdf', 'text/plain')).toThrow(ValidationError);
  });
});

describe('verifyFileSignature', () => {
  it('accepts a real PDF header and rejects a renamed file', () => {
    expect(() => verifyFileSignature(PDF_BYTES, 'PDF')).not.toThrow();
    expect(() => verifyFileSignature(TXT_BYTES, 'PDF')).toThrow(UnsupportedMediaTypeError);
  });

  it('accepts a ZIP header for DOCX and rejects plain text renamed to .docx', () => {
    expect(() => verifyFileSignature(DOCX_BYTES, 'DOCX')).not.toThrow();
    expect(() => verifyFileSignature(TXT_BYTES, 'DOCX')).toThrow(UnsupportedMediaTypeError);
  });

  it('rejects binary content declared as text', () => {
    const binary = new Uint8Array(256);
    for (let i = 0; i < binary.length; i += 1) binary[i] = 0x01;
    expect(() => verifyFileSignature(binary, 'TXT')).toThrow(UnsupportedMediaTypeError);
  });
});

describe('hashFileBytes', () => {
  it('produces a stable SHA-256 digest and differs for different content', () => {
    expect(hashFileBytes(TXT_BYTES)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFileBytes(TXT_BYTES)).toBe(hashFileBytes(TXT_BYTES));
    expect(hashFileBytes(TXT_BYTES)).not.toBe(hashFileBytes(PDF_BYTES));
  });
});

describe('validateUpload', () => {
  const base = { fileName: 'notes.txt', mimeType: 'text/plain', maxBytes: 1024 };

  it('returns validated metadata for a good upload', () => {
    const result = validateUpload({ ...base, bytes: TXT_BYTES });
    expect(result.sourceType).toBe('TXT');
    expect(result.extension).toBe('.txt');
    expect(result.size).toBe(TXT_BYTES.byteLength);
  });

  it('rejects an empty file', () => {
    expect(() => validateUpload({ ...base, bytes: new Uint8Array(0) })).toThrow(ValidationError);
  });

  it('rejects a file above the size limit', () => {
    expect(() => validateUpload({ ...base, bytes: TXT_BYTES, maxBytes: 4 })).toThrow(
      PayloadTooLargeError,
    );
  });

  it('rejects an unsupported media type', () => {
    expect(() =>
      validateUpload({ ...base, fileName: 'run.sh', mimeType: 'text/plain', bytes: TXT_BYTES }),
    ).toThrow(UnsupportedMediaTypeError);
  });
});

describe('storage keys', () => {
  it('builds a tenant-scoped, dated key', () => {
    const key = buildStorageKey({
      organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      documentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      safeFileName: 'report.pdf',
      now: new Date('2026-04-18T00:00:00Z'),
    });

    expect(key.startsWith('documents/aaaaaaaaaaaaaaaaaaaaaaaa/2026/04/bbbbbbbbbbbbbbbbbbbbbbbb/')).toBe(true);
    expect(key.endsWith('-report.pdf')).toBe(true);
  });

  it('produces unique keys for identical inputs', () => {
    const params = {
      organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      documentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      safeFileName: 'report.pdf',
    };
    expect(buildStorageKey(params)).not.toBe(buildStorageKey(params));
  });

  it('only accepts keys inside the documents prefix', () => {
    expect(isAllowedStorageKey('documents/org/2026/04/doc/file.pdf')).toBe(true);
    expect(isAllowedStorageKey('secrets/credentials.json')).toBe(false);
    expect(isAllowedStorageKey('documents/../../etc/passwd')).toBe(false);
  });
});

describe('PlainTextExtractor', () => {
  const extractor = new PlainTextExtractor();

  it('advertises support for TXT and Markdown only', () => {
    expect(extractor.supports('TXT')).toBe(true);
    expect(extractor.supports('MARKDOWN')).toBe(true);
    expect(extractor.supports('PDF')).toBe(false);
  });

  it('extracts and normalises plain text', async () => {
    const result = await extractor.extract(TXT_BYTES);
    expect(result.text).toBe('Agenda\n\n- Ship the report');
    expect(result.pageCount).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('strips a UTF-8 BOM', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Hello')]);
    expect(decodeText(withBom).text).toBe('Hello');
  });

  it('falls back to Latin-1 and warns on invalid UTF-8', () => {
    const latin1 = new Uint8Array([0x48, 0xe9, 0x6c, 0x6c, 0x6f]);
    const decoded = decodeText(latin1);
    expect(decoded.encodingFallback).toBe(true);
    expect(decoded.text).toContain('H');
  });

  it('warns instead of throwing when there is no readable text', async () => {
    const result = await extractor.extract(new TextEncoder().encode('   \n\n  '));
    expect(result.text).toBe('');
    expect(result.warnings.join(' ')).toMatch(/no readable text/i);
  });

  it('rejects an empty buffer', async () => {
    await expect(extractor.extract(new Uint8Array(0))).rejects.toThrow(ValidationError);
  });
});