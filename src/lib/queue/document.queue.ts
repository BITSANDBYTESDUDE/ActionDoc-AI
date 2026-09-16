/**
 * Document processing queue (Redis + BullMQ).
 *
 * The queue is optional: without REDIS_URL the application still works, and
 * processing can be triggered synchronously from the API route instead. Jobs
 * carry only ids - never file contents - so a Redis dump cannot leak documents.
 */
import { Queue, type JobsOptions } from 'bullmq';
import { getRedis } from '@/lib/db/redis';

export const DOCUMENT_QUEUE_NAME = 'document-processing';

export type DocumentJobName = 'process-document';

export interface ProcessDocumentJobData {
  organizationId: string;
  documentId: string;
  /** Ids only - the worker re-reads everything from MongoDB. */
  requestedById: string | null;
  /** Attempt counter used for logging; BullMQ tracks the real attemptsMade. */
  reason: 'upload' | 'retry' | 'manual';
}

export interface DocumentQueue {
  readonly isConfigured: boolean;
  enqueue(data: ProcessDocumentJobData, options?: JobsOptions): Promise<string | null>;
}

class BullDocumentQueue implements DocumentQueue {
  readonly isConfigured = true;
  private readonly queue: Queue<ProcessDocumentJobData>;

  constructor(redisUrl: string) {
    this.queue = new Queue<ProcessDocumentJobData>(DOCUMENT_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        // Retry with exponential backoff: 5s, 10s, 20s ... capped at 5 minutes.
        attempts: 4,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
      },
    });
  }

  async enqueue(data: ProcessDocumentJobData, options?: JobsOptions): Promise<string | null> {
    // Uploads and retries are idempotent per document: a duplicate submission is
    // ignored. Manual re-analysis must be allowed repeatedly, so it gets a
    // time-based id instead.
    const jobId =
      options?.jobId ??
      (data.reason === 'manual'
        ? `${data.documentId}:manual:${Date.now()}`
        : `${data.documentId}:${data.reason}`);

    try {
      const job = await this.queue.add('process-document', data, { ...options, jobId });
      return job.id ?? null;
    } catch (error) {
      console.error('[queue] failed to enqueue document job', {
        documentId: data.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

class NoopDocumentQueue implements DocumentQueue {
  readonly isConfigured = false;
  async enqueue(): Promise<null> {
    return null;
  }
}

let cached: DocumentQueue | null = null;

export function getDocumentQueue(): DocumentQueue {
  if (cached) return cached;
  const redisUrl = process.env.REDIS_URL;
  const redis = getRedis();

  // If ioredis could not initialise we must not hand BullMQ a broken URL.
  if (!redisUrl || !redis) {
    cached = new NoopDocumentQueue();
    return cached;
  }

  cached = new BullDocumentQueue(redisUrl);
  return cached;
}

export function resetDocumentQueueCache() {
  cached = null;
}

/**
 * Queue a document for background processing, falling back to inline
 * processing when Redis is unavailable so uploads always make progress.
 */
export async function enqueueDocumentProcessing(data: ProcessDocumentJobData): Promise<{
  queued: boolean;
  fellBackToInline: boolean;
}> {
  const queue = getDocumentQueue();
  if (queue.isConfigured) {
    const jobId = await queue.enqueue(data);
    if (jobId) return { queued: true, fellBackToInline: false };
  }

  if (shouldProcessInline()) {
    // Import lazily: keeps BullMQ and the extractors out of the request bundle
    // for routes that never process documents.
    const { processDocumentJob } = await import('@/workers/document.worker');
    await processDocumentJob(data).catch((error) => {
      console.error('[queue] inline processing failed', {
        documentId: data.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return { queued: false, fellBackToInline: true };
  }

  return { queued: false, fellBackToInline: false };
}

/**
 * Inline processing is enabled when no Redis is configured (so the app is
 * usable in development) or when ENABLE_INLINE_WORKER is explicitly set.
 */
export function shouldProcessInline(): boolean {
  if (process.env.ENABLE_INLINE_WORKER === 'true') return true;
  return !process.env.REDIS_URL;
}

/** Whether a real BullMQ queue is wired up. Used by the settings diagnostics. */
export function isQueueConfigured(): boolean {
  return getDocumentQueue().isConfigured;
}