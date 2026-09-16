import { Types } from 'mongoose';
import { Document } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { extractDocumentText } from '@/lib/documents/extract';
import { countWords } from '@/lib/documents/normalize';
import { getStorage } from '@/lib/storage';
import { isAllowedStorageKey } from '@/lib/storage/keys';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { connectToDatabase } from '@/lib/db/connect';
import type { DocumentSourceType, ExtractionResult } from '@/types/documents';

/**
 * Text extraction stage of the pipeline.
 *
 * Reads the file from private storage, delegates to the format-specific
 * extractor and persists the normalised text plus derived statistics on the
 * document. Kept separate from the AI stage so extraction can be retried
 * without re-running (and re-billing) analysis.
 */
export async function extractDocumentTextForDocument(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<ExtractionResult> {
  await connectToDatabase();

  const document = await Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  }).lean();

  if (!document) throw new NotFoundError('Document');

  const storage = getStorage();
  if (!storage.isConfigured) {
    throw new ValidationError(
      'Object storage is not configured, so the file cannot be read for extraction.',
    );
  }
  if (!isAllowedStorageKey(document.storageKey)) {
    throw new ValidationError('The document storage key is invalid.');
  }

  const bytes = await storage.getObjectBody(document.storageKey);
  const result = await extractDocumentText(bytes, document.sourceType as DocumentSourceType);

  await Document.updateOne(
    { _id: document._id, organizationId: params.organizationId },
    {
      $set: {
        extractedText: result.text,
        'metadata.pageCount': result.pageCount,
        'metadata.wordCount': countWords(result.text),
        'metadata.charCount': result.text.length,
        'metadata.extractionMethod': result.extractionMethod,
        'metadata.warnings': result.warnings,
        status: statusAfterExtraction(result.text),
        processingCompletedAt: new Date(),
        failureReason: null,
      },
    },
  );

  return result;
}

/**
 * Empty text means there is nothing for the AI to analyse, so the document
 * moves to REVIEW with a warning instead of looking stuck in processing.
 */
function statusAfterExtraction(text: string) {
  return text.trim().length > 0 ? 'EXTRACTED' : 'REVIEW';
}

export async function markDocumentExtractionFailed(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  reason: string;
}): Promise<void> {
  await connectToDatabase();
  await Document.updateOne(
    { _id: new Types.ObjectId(params.documentId), organizationId: params.organizationId },
    {
      $set: {
        status: 'FAILED',
        failureReason: params.reason.slice(0, 1000),
        processingCompletedAt: new Date(),
      },
    },
  );
}

export async function listExtractionsForDocument(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}) {
  await connectToDatabase();
  return DocumentExtraction.find({
    organizationId: params.organizationId,
    documentId: new Types.ObjectId(params.documentId),
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getLatestExtraction(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}) {
  await connectToDatabase();
  return DocumentExtraction.findOne({
    organizationId: params.organizationId,
    documentId: new Types.ObjectId(params.documentId),
  })
    .sort({ createdAt: -1 })
    .lean();
}