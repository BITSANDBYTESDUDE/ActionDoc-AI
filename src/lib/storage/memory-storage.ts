/**
 * In-process object storage.
 *
 * Used when `STORAGE_DRIVER=memory` (local development and the test suite)
 * so the document pipeline can run end-to-end without S3 credentials. It is a
 * real implementation of the storage contract - not a mock - and it is never
 * selected in production because the driver must be set explicitly.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { ObjectStorage, PutObjectInput, StoredObject } from '@/lib/storage/types';

interface StoredEntry {
  body: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
}

const objects = new Map<string, StoredEntry>();

export class MemoryObjectStorage implements ObjectStorage {
  readonly provider = 'memory';
  readonly isConfigured = true;

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const body = input.body instanceof Uint8Array ? input.body : new Uint8Array(input.body);
    objects.set(input.key, {
      body,
      contentType: input.contentType,
      metadata: input.metadata ?? {},
    });
    return { key: input.key, size: body.byteLength, contentType: input.contentType };
  }

  async getObjectBody(key: string): Promise<Uint8Array> {
    const entry = objects.get(key);
    if (!entry) throw new Error(`Object not found in memory storage: ${key}`);
    return entry.body;
  }

  async deleteObject(key: string): Promise<void> {
    objects.delete(key);
  }

  async getSignedDownloadUrl(
    key: string,
    options?: { fileName?: string; expiresInSeconds?: number },
  ): Promise<string> {
    const entry = objects.get(key);
    if (!entry) throw new Error(`Object not found in memory storage: ${key}`);
    const expires = options?.expiresInSeconds ?? 900;
    const token = createHash('sha256').update(`${key}:${randomUUID()}`).digest('hex');
    return `/api/storage/memory/${encodeURIComponent(key)}?token=${token}&expires=${expires}`;
  }

  async headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
    const entry = objects.get(key);
    if (!entry) return null;
    return { size: entry.body.byteLength, contentType: entry.contentType };
  }
}

export function clearMemoryStorage(): void {
  objects.clear();
}

export function memoryStorageObjectCount(): number {
  return objects.size;
}