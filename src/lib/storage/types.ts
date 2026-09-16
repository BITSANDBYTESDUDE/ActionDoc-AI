/**
 * Provider-agnostic object storage interface.
 *
 * The S3 implementation targets any S3-compatible endpoint (Cloudflare R2,
 * AWS S3, MinIO, Backblaze B2). A `null` implementation is provided so the app
 * boots without storage credentials - uploads then fail with a clear
 * ExternalServiceError instead of a crash at import time.
 */
import type { Readable } from 'node:stream';

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
  /** Optional checksum metadata for integrity verification. */
  metadata?: Record<string, string>;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface ObjectStorage {
  readonly provider: string;
  readonly isConfigured: boolean;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectBody(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
  /** Time-limited, read-only URL. Never exposes credentials. */
  getSignedDownloadUrl(key: string, options?: { fileName?: string; expiresInSeconds?: number }): Promise<string>;
  headObject(key: string): Promise<{ size: number; contentType?: string } | null>;
}

export type { Readable };