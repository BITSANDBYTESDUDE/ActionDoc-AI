/**
 * Document processing worker.
 *
 * Two entry points:
 *  - `processDocumentJob`  - the actual work, callable inline or from BullMQ.
 *  - `startDocumentWorker` - the long-running BullMQ consumer (`npm run worker`).
 *
 * The job is idempotent: it re-reads the document, skips work that has already
 * been done, and uses conditional updates so a duplicate delivery cannot create
 * a second extraction.
 */
import { Types } from 'mongoose';
import { Document } from '@/models/Document';
import { connectToDatabase } from '@/lib/db/connect';
import {
  extractDocumentTextForDocument,
  markDocumentExtractionFailed,
} from '@/services/extraction.service';
import { runAnalysisForDocument } from '@/services/ai.service';
import { enqueueDocumentProcessing, type ProcessDocumentJobData } from '@/lib/queue/document.queue';

export interface ProcessDocumentResult {
  documentId: string;
  outcome: 'completed' | 'skipped' | 'failed';
  reason?: string;
  suggestionCount?: number;
}

export async function processDocumentJob(data: ProcessDocumentJobData): Promise<ProcessDocumentResult> {
  const organizationId = new Types.ObjectId(data.organizationId);
  const documentId = new Types.ObjectId(data.documentId);

  await connectToDatabase();

  const document = await Document.findOne({
    _id: documentId,
    organizationId,
    deletedAt: null,
  })
    .select('+extractedText status displayName')
    .lean();

  if (!document) {
    // The document was deleted between enqueue and execution - not an error.
    return { documentId: data.documentId, outcome: 'skipped', reason: 'Document no longer exists.' };
  }

  const extractedText = (document as unknown as { extractedText?: string }).extractedText ?? '';
  const terminalStatuses = ['REVIEW', 'COMPLETED'] as const;

  // Idempotency: a finished document is never reprocessed by a duplicate job.
  if ((terminalStatuses as readonly string[]).includes(document.status)) {
    return {
      documentId: data.documentId,
      outcome: 'skipped',
      reason: `Document is already in the ${document.status} state.`,
    };
  }

  try {
    // Stage 1 - extraction. Skipped when text is already present.
    if (extractedText.trim().length === 0) {
      await markProcessingStarted(organizationId, documentId);
      await extractDocumentTextForDocument({
        organizationId,
        documentId: data.documentId,
      });
    }

    // Re-read: extraction may have concluded there is nothing to analyse.
    const refreshed = await Document.findOne({ _id: documentId, organizationId })
      .select('+extractedText status')
      .lean();

    if (!refreshed) {
      return { documentId: data.documentId, outcome: 'skipped', reason: 'Document no longer exists.' };
    }

    const text = (refreshed as unknown as { extractedText?: string }).extractedText ?? '';
    if (text.trim().length === 0) {
      return {
        documentId: data.documentId,
        outcome: 'skipped',
        reason: 'No extractable text was found, so the document was not analysed.',
      };
    }

    // Stage 2 - AI analysis. Creates PENDING suggestions awaiting human review.
    const result = await runAnalysisForDocument({
      organizationId,
      documentId: data.documentId,
      actorId: data.requestedById ? new Types.ObjectId(data.requestedById) : null,
    });

    return {
      documentId: data.documentId,
      outcome: 'completed',
      suggestionCount: result.suggestionCount,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    console.error('[worker] document processing failed', {
      documentId: data.documentId,
      organizationId: data.organizationId,
      reason,
    });

    await markDocumentExtractionFailed({ organizationId, documentId: data.documentId, reason }).catch(
      () => undefined,
    );

    // Rethrow so BullMQ records the failure and applies its retry policy.
    throw error;
  }
}

async function markProcessingStarted(organizationId: Types.ObjectId, documentId: Types.ObjectId) {
  await Document.updateOne(
    { _id: documentId, organizationId, status: { $in: ['UPLOADED', 'FAILED'] } },
    { $set: { status: 'PROCESSING', processingStartedAt: new Date(), failureReason: null } },
  );
}

/**
 * Start the BullMQ consumer. Run via `npm run worker` alongside the Next.js
 * server; it is intentionally not started from a route handler so serverless
 * deployments never hold a long-lived connection.
 */
export async function startDocumentWorker(): Promise<() => Promise<void>> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required to start the document worker.');
  }

  const { Worker } = await import('bullmq');
  const { DOCUMENT_QUEUE_NAME } = await import('@/lib/queue/document.queue');

  const concurrency = Number(process.env.DOCUMENT_QUEUE_CONCURRENCY ?? 2);

  const worker = new Worker<ProcessDocumentJobData>(
    DOCUMENT_QUEUE_NAME,
    async (job) => {
      const startedAt = Date.now();
      console.log('[worker] job started', { id: job.id, name: job.name, documentId: job.data.documentId });

      const result = await processDocumentJob(job.data);

      console.log('[worker] job finished', {
        id: job.id,
        documentId: job.data.documentId,
        outcome: result.outcome,
        durationMs: Date.now() - startedAt,
      });
      return result;
    },
    {
      connection: { url: redisUrl },
      concurrency,
      // Keep a bounded lock so a crashed worker releases its job.
      lockDuration: 5 * 60 * 1000,
    },
  );

  worker.on('failed', (job, error) => {
    console.error('[worker] job failed', {
      id: job?.id,
      documentId: job?.data?.documentId,
      attemptsMade: job?.attemptsMade,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  worker.on('error', (error) => {
    console.error('[worker] worker error', error instanceof Error ? error.message : String(error));
  });

  console.log(`[worker] listening on "${DOCUMENT_QUEUE_NAME}" with concurrency ${concurrency}`);

  return async () => {
    await worker.close();
  };
}

/** Re-enqueue a document that previously failed. */
export async function retryDocumentProcessing(data: ProcessDocumentJobData) {
  return enqueueDocumentProcessing({ ...data, reason: 'retry' });
}