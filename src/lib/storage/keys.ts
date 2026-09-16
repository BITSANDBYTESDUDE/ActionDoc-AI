/**
 * File validation and safe storage-key derivation.
 *
 * Uploaded filenames are treated as hostile input: the original name is kept
 * for display only, while the storage key is built from validated primitives.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
} from '@/config/constants';
import { PayloadTooLargeError, UnsupportedMediaTypeError, ValidationError } from '@/lib/errors';
import type { DocumentSourceType } from '@/types/documents';

const EXTENSION_TO_SOURCE: Record<string, DocumentSourceType> = {
  '.pdf': 'PDF',
  '.docx': 'DOCX',
  '.txt': 'TXT',
  '.md': 'MARKDOWN',
};

const MIME_TO_SOURCE: Record<string, DocumentSourceType> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/markdown': 'MARKDOWN',
};

export interface ValidatedUpload {
  originalName: string;
  /** Safe, display-oriented name - no path separators or control characters. */
  safeFileName: string;
  extension: string;
  mimeType: string;
  sourceType: DocumentSourceType;
  size: number;
  hash: string;
}

/**
 * Strip directory components, control characters and reserved characters from a
 * user-supplied filename. Returns a value safe to echo in the UI and to use in a
 * storage key.
 */
export function sanitizeFileName(input: string): string {
  const base = path.basename(input.replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\?%*:|"<>#]/g, '-')
    // Reserved-character runs would otherwise produce long dash streaks.
    .replace(/-{3,}/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  const safe = cleaned.length > 0 ? cleaned : 'document';
  return safe.slice(0, 180);
}

export function detectSourceType(fileName: string, mimeType: string): DocumentSourceType {
  const extension = path.extname(fileName).toLowerCase();
  const byExtension = EXTENSION_TO_SOURCE[extension];
  const byMime = MIME_TO_SOURCE[mimeType];

  if (!byExtension) {
    throw new UnsupportedMediaTypeError(
      `Unsupported file extension "${extension || 'unknown'}". Allowed: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`,
    );
  }
  if (!byMime) {
    throw new UnsupportedMediaTypeError(
      `Unsupported content type "${mimeType || 'unknown'}". Allowed: ${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}.`,
    );
  }
  if (byExtension !== byMime) {
    throw new ValidationError(
      `File extension (${extension}) does not match the declared content type (${mimeType}).`,
    );
  }
  return byExtension;
}

/**
 * Verify the file's magic bytes agree with the declared type. This blocks the
 * classic "renamed executable" upload attack.
 */
export function verifyFileSignature(bytes: Uint8Array, sourceType: DocumentSourceType): void {
  const header = bytes.subarray(0, 8);

  if (sourceType === 'PDF') {
    const signature = String.fromCharCode(...header.subarray(0, 5));
    if (signature !== '%PDF-') {
      throw new UnsupportedMediaTypeError('The file does not appear to be a valid PDF document.');
    }
    return;
  }

  if (sourceType === 'DOCX') {
    // DOCX is a ZIP container: "PK\x03\x04".
    const isZip = header[0] === 0x50 && header[1] === 0x4b && (header[2] === 0x03 || header[2] === 0x05);
    if (!isZip) {
      throw new UnsupportedMediaTypeError('The file does not appear to be a valid DOCX document.');
    }
    return;
  }

  // TXT/MARKDOWN: reject content that clearly contains binary control bytes.
  const sample = bytes.subarray(0, 4096);
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controlBytes += 1;
  }
  if (sample.length > 0 && controlBytes / sample.length > 0.05) {
    throw new UnsupportedMediaTypeError('The file does not appear to be a plain text document.');
  }
}

export function hashFileBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertFileSize(size: number, maxBytes: number): void {
  if (size <= 0) throw new ValidationError('The uploaded file is empty.');
  if (size > maxBytes) {
    throw new PayloadTooLargeError(
      `The file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB upload limit.`,
    );
  }
}

export function validateUpload(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  maxBytes: number;
}): ValidatedUpload {
  assertFileSize(input.bytes.byteLength, input.maxBytes);

  const safeFileName = sanitizeFileName(input.fileName);
  const extension = path.extname(safeFileName).toLowerCase();
  const sourceType = detectSourceType(safeFileName, input.mimeType);
  verifyFileSignature(input.bytes, sourceType);

  return {
    originalName: input.fileName.slice(0, 512),
    safeFileName,
    extension,
    mimeType: input.mimeType,
    sourceType,
    size: input.bytes.byteLength,
    hash: hashFileBytes(input.bytes),
  };
}

/**
 * documents/{organizationId}/{year}/{month}/{documentId}/{safeFilename}
 * A random suffix guarantees uniqueness even for repeated identical names.
 */
export function buildStorageKey(params: {
  organizationId: string;
  documentId: string;
  safeFileName: string;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const org = params.organizationId.replace(/[^a-f\d]/gi, '');
  const docId = params.documentId.replace(/[^a-f\d]/gi, '');
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `documents/${org}/${year}/${month}/${docId}/${unique}-${params.safeFileName}`;
}

export function isAllowedStorageKey(key: string): boolean {
  return key.startsWith('documents/') && !key.includes('..');
}