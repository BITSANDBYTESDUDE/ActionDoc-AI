import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Document } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { Action } from '@/models/Action';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { getStorage } from '@/lib/storage';
import { MAX_UPLOAD_BYTES_DEFAULT, MAX_PAGE_SIZE } from '@/config/constants';
import { recordAuditEvent } from '@/services/audit.service';
import { buildStorageKey, isAllowedStorageKey } from '@/lib/storage/keys';
import { paginated, type PaginatedResult } from '@/lib/validation/common';
import type { DocumentListQuery } from '@/lib/validation/document';
import type { DocumentSourceType } from '@/types/documents';

export interface StoredDocumentSummary {
  id: string;
  organizationId: string;
  createdById: string;
  createdByName?: string | null;
  originalName: string;
  displayName: string;
  mimeType: string;
  sourceType: DocumentSourceType;
  fileSize: number;
  status: string;
  summary: string;
  metadata: {
    pageCount: number | null;
    wordCount: number | null;
    charCount: number | null;
    extractionMethod: string | null;
    warnings: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  processingCompletedAt: Date | null;
  failureReason: string | null;
  lastExtractionId: string | null;
}

const LIST_PROJECTION = {
  originalName: 1,
  displayName: 1,
  mimeType: 1,
  sourceType: 1,
  fileSize: 1,
  status: 1,
  summary: 1,
  metadata: 1,
  createdAt: 1,
  updatedAt: 1,
  createdById: 1,
  organizationId: 1,
  processingCompletedAt: 1,
  failureReason: 1,
  lastExtractionId: 1,
} as const;

function toSummary(doc: Record<string, unknown>): StoredDocumentSummary {
  return {
    id: String(doc._id),
    organizationId: String(doc.organizationId),
    createdById: String(doc.createdById),
    createdByName: (doc.createdByName as string | null) ?? null,
    originalName: doc.originalName as string,
    displayName: doc.displayName as string,
    mimeType: doc.mimeType as string,
    sourceType: doc.sourceType as DocumentSourceType,
    fileSize: doc.fileSize as number,
    status: doc.status as string,
    summary: (doc.summary as string) ?? '',
    metadata: {
      pageCount: (doc.metadata as StoredDocumentSummary['metadata'])?.pageCount ?? null,
      wordCount: (doc.metadata as StoredDocumentSummary['metadata'])?.wordCount ?? null,
      charCount: (doc.metadata as StoredDocumentSummary['metadata'])?.charCount ?? null,
      extractionMethod: (doc.metadata as StoredDocumentSummary['metadata'])?.extractionMethod ?? null,
      warnings: (doc.metadata as StoredDocumentSummary['metadata'])?.warnings ?? [],
    },
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    processingCompletedAt: (doc.processingCompletedAt as Date) ?? null,
    failureReason: (doc.failureReason as string) ?? null,
    lastExtractionId: doc.lastExtractionId ? String(doc.lastExtractionId) : null,
  };
}

/**
 * Persist an uploaded file and its metadata.
 *
 * Steps: duplicate detection (per organization, by SHA-256) -> upload to
 * private storage -> insert metadata. If the metadata insert fails the stored
 * object is removed so we never leak orphaned files.
 */
export async function createDocumentFromUpload(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  file: {
    originalName: string;
    safeFileName: string;
    mimeType: string;
    sourceType: DocumentSourceType;
    size: number;
    hash: string;
    bytes: Uint8Array;
  };
  allowDuplicate?: boolean;
}) {
  await connectToDatabase();

  const existing = await Document.findOne({
    organizationId: params.organizationId,
    fileHash: params.file.hash,
    deletedAt: null,
  })
    .select('displayName _id')
    .lean();

  if (existing && !params.allowDuplicate) {
    throw new ConflictError(
      `This file has already been uploaded as "${existing.displayName}".`,
      [{ path: 'file', message: 'Duplicate file detected in this organization.' }],
    );
  }

  const documentId = new Types.ObjectId();
  const storageKey = buildStorageKey({
    organizationId: String(params.organizationId),
    documentId: String(documentId),
    safeFileName: params.file.safeFileName,
  });

  const storage = getStorage();
  await storage.putObject({
    key: storageKey,
    body: params.file.bytes,
    contentType: params.file.mimeType,
    metadata: { sha256: params.file.hash, organizationId: String(params.organizationId) },
  });

  try {
    const document = await Document.create({
      _id: documentId,
      organizationId: params.organizationId,
      createdById: params.userId,
      originalName: params.file.originalName,
      displayName: params.file.safeFileName,
      mimeType: params.file.mimeType,
      sourceType: params.file.sourceType,
      fileSize: params.file.size,
      storageKey,
      fileHash: params.file.hash,
      status: 'UPLOADED',
    });

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorName: params.userName,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'DOCUMENT',
      entityId: document._id,
      metadata: { name: params.file.safeFileName, size: params.file.size, type: params.file.sourceType },
    });

    return toSummary(document.toObject() as unknown as Record<string, unknown>);
  } catch (error) {
    // Roll back the stored object so a failed insert cannot orphan a file.
    await storage.deleteObject(storageKey).catch(() => undefined);
    throw error;
  }
}

/**
 * Server-side paginated document list. Always organization-scoped, always
 * projection-limited so the extracted text column is never loaded.
 */
export async function listDocuments(params: {
  organizationId: Types.ObjectId;
  query: DocumentListQuery;
}): Promise<PaginatedResult<StoredDocumentSummary>> {
  await connectToDatabase();

  const { query } = params;
  const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE);
  const filter: Record<string, unknown> = {
    organizationId: params.organizationId,
    deletedAt: null,
  };

  if (query.status) filter.status = query.status;
  if (query.sourceType) filter.sourceType = query.sourceType;
  if (query.createdById) filter.createdById = new Types.ObjectId(query.createdById);

  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.$gte = query.dateFrom;
    if (query.dateTo) range.$lte = query.dateTo;
    filter.createdAt = range;
  }

  if (query.search) {
    // Anchored regex on indexed-ish fields; escaped to prevent ReDoS.
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
    filter.displayName = { $regex: escaped, $options: 'i' };
  }

  const sort: Record<string, 1 | -1> = { [query.sort]: query.order === 'asc' ? 1 : -1 };
  if (query.sort !== 'createdAt') sort.createdAt = -1;

  const skip = (query.page - 1) * pageSize;

  const [docs, total] = await Promise.all([
    Document.find(filter).select(LIST_PROJECTION).sort(sort).skip(skip).limit(pageSize).lean(),
    Document.countDocuments(filter),
  ]);

  const items = docs.map((doc) => toSummary(doc as unknown as Record<string, unknown>));
  return paginated(items, total, query.page, pageSize);
}

/**
 * Fetch one document inside the organization, including its extracted text and
 * a synthetic, time-limited download URL (the storage key is never returned).
 */
export async function getDocumentDetail(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  includeText?: boolean;
}) {
  await connectToDatabase();

  const query = Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  });
  if (params.includeText) query.select('+extractedText');

  const doc = await query
    .populate<{ createdById: { _id: Types.ObjectId; name: string } | null }>('createdById', 'name')
    .lean();

  if (!doc) throw new NotFoundError('Document');

  const summary = toSummary({
    ...doc,
    createdByName: (doc.createdById as unknown as { name: string } | null)?.name ?? null,
  });

  const storage = getStorage();
  let downloadUrl: string | null = null;
  if (storage.isConfigured && isAllowedStorageKey(doc.storageKey)) {
    downloadUrl = await storage
      .getSignedDownloadUrl(doc.storageKey, { fileName: doc.displayName })
      .catch(() => null);
  }

  return {
    ...summary,
    extractedText: (doc as unknown as { extractedText?: string }).extractedText ?? null,
    downloadUrl,
  };
}

export async function getDocumentExtractedText(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<{ id: string; text: string; displayName: string; sourceType: DocumentSourceType } | null> {
  await connectToDatabase();
  const doc = await Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  })
    .select('+extractedText displayName sourceType')
    .lean();

  if (!doc) return null;
  return {
    id: String(doc._id),
    text: (doc as unknown as { extractedText?: string }).extractedText ?? '',
    displayName: doc.displayName,
    sourceType: doc.sourceType as DocumentSourceType,
  };
}

export async function getSignedDownloadUrl(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<string> {
  const doc = await getDocumentDetail(params);
  if (!doc.downloadUrl) {
    const storage = getStorage();
    if (!storage.isConfigured) {
      throw new ConflictError('Object storage is not configured, so downloads are unavailable.');
    }
    throw new ConflictError('A download link could not be generated for this document.');
  }
  return doc.downloadUrl;
}

export async function updateDocumentMetadata(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  actorId: Types.ObjectId;
  displayName?: string;
  summary?: string;
}): Promise<StoredDocumentSummary> {
  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (params.displayName !== undefined) update.displayName = params.displayName;
  if (params.summary !== undefined) update.summary = params.summary;

  const doc = await Document.findOneAndUpdate(
    {
      _id: new Types.ObjectId(params.documentId),
      organizationId: params.organizationId,
      deletedAt: null,
    },
    { $set: update },
    { returnDocument: 'after' },
  ).lean();

  if (!doc) throw new NotFoundError('Document');
  return toSummary(doc as unknown as Record<string, unknown>);
}

/**
 * Soft-delete a document, remove the stored object and detach its actions.
 *
 * Actions are deliberately preserved: work that was already committed should
 * not vanish because a source file was removed. They keep a source name for
 * traceability instead of a dangling reference.
 */
export async function deleteDocument(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  actorId: Types.ObjectId;
  actorName: string;
}): Promise<{ detachedActions: number }> {
  await connectToDatabase();

  const doc = await Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  }).lean();

  if (!doc) throw new NotFoundError('Document');

  const storage = getStorage();
  if (storage.isConfigured && isAllowedStorageKey(doc.storageKey)) {
    await storage.deleteObject(doc.storageKey).catch((error) => {
      console.error('[documents] failed to delete stored object', {
        documentId: params.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const detached = await Action.updateMany(
    { organizationId: params.organizationId, documentId: doc._id },
    { $set: { sourceDocumentName: doc.displayName, documentId: null, extractionId: null } },
  );

  await DocumentExtraction.deleteMany({
    organizationId: params.organizationId,
    documentId: doc._id,
  });

  await Document.updateOne(
    { _id: doc._id, organizationId: params.organizationId },
    {
      $set: {
        deletedAt: new Date(),
        status: 'FAILED',
        failureReason: 'Document deleted by a user.',
        extractedText: '',
        storageKey: `deleted/${doc.storageKey}`,
      },
    },
  );

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'DOCUMENT_DELETED',
    entityType: 'DOCUMENT',
    entityId: doc._id,
    metadata: { name: doc.displayName, detachedActions: detached.modifiedCount },
  });

  return { detachedActions: detached.modifiedCount };
}

export async function assertDocumentInOrganization(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<void> {
  await connectToDatabase();
  const exists = await Document.exists({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  });
  if (!exists) throw new NotFoundError('Document');
}

export function getMaxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_BYTES ?? MAX_UPLOAD_BYTES_DEFAULT);
}