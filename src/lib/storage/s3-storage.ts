import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ExternalServiceError } from '@/lib/errors';
import type { ObjectStorage, PutObjectInput, StoredObject } from '@/lib/storage/types';

interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly provider = 's3';
  readonly isConfigured = true;
  private readonly client: S3Client;
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: input.metadata,
        }),
      );
      return { key: input.key, size: input.body.byteLength, contentType: input.contentType };
    } catch (error) {
      throw new ExternalServiceError('storage', 'Failed to store the file. Please try again.', {
        operation: 'putObject',
        key: input.key,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getObjectBody(key: string): Promise<Uint8Array> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!result.Body) throw new Error('Empty response body');
      const bytes = await result.Body.transformToByteArray();
      return bytes;
    } catch (error) {
      throw new ExternalServiceError('storage', 'Failed to read the stored file.', {
        operation: 'getObjectBody',
        key,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      throw new ExternalServiceError('storage', 'Failed to delete the stored file.', {
        operation: 'deleteObject',
        key,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getSignedDownloadUrl(
    key: string,
    options: { fileName?: string; expiresInSeconds?: number } = {},
  ): Promise<string> {
    const expiresIn = options.expiresInSeconds ?? this.config.signedUrlTtlSeconds;
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(options.fileName
          ? { ResponseContentDisposition: `attachment; filename="${sanitizeHeaderValue(options.fileName)}"` }
          : {}),
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      throw new ExternalServiceError('storage', 'Failed to create a download link.', {
        operation: 'getSignedDownloadUrl',
        key,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async headObject(key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (result.ContentLength === undefined) return null;
      return { size: result.ContentLength, contentType: result.ContentType };
    } catch {
      return null;
    }
  }
}

/** Strip characters that would allow header injection in Content-Disposition. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n"\\]/g, '_').slice(0, 200);
}