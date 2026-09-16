import { ExternalServiceError } from '@/lib/errors';
import { MemoryObjectStorage } from '@/lib/storage/memory-storage';
import { S3ObjectStorage } from '@/lib/storage/s3-storage';
import type { ObjectStorage } from '@/lib/storage/types';

/**
 * Storage that is not configured. Every method fails with an actionable error
 * so the feature is clearly unavailable rather than silently broken.
 */
class UnconfiguredStorage implements ObjectStorage {
  readonly provider = 'unconfigured';
  readonly isConfigured = false;
  private fail(): never {
    throw new ExternalServiceError(
      'storage',
      'Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
    );
  }
  async putObject(): Promise<never> {
    return this.fail();
  }
  async getObjectBody(): Promise<never> {
    return this.fail();
  }
  async deleteObject(): Promise<never> {
    return this.fail();
  }
  async getSignedDownloadUrl(): Promise<never> {
    return this.fail();
  }
  async headObject(): Promise<null> {
    return null;
  }
}

let cached: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (cached) return cached;

  // Explicit opt-in driver for local development and tests. Never defaulted to,
  // because in-memory objects do not survive a deploy.
  if (process.env.STORAGE_DRIVER === 'memory') {
    cached = new MemoryObjectStorage();
    return cached;
  }

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    cached = new UnconfiguredStorage();
    return cached;
  }

  cached = new S3ObjectStorage({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    signedUrlTtlSeconds: Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? 900),
  });
  return cached;
}

export function resetStorageCache() {
  cached = null;
}