import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Document } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { Membership } from '@/models/Membership';
import { analyzeDocument, parseAiDueDate } from '@/lib/ai/analyze';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { EXTRACTION_VERSION } from '@/config/constants';
import { recordAuditEvent } from '@/services/audit.service';
import { createNotification, createNotifications, isDuplicateKeyError } from '@/services/notification.service';

/**
 * AI analysis stage of the pipeline.
 *
 * The AI result is validated with zod before anything is stored, then persisted
 * as a DocumentExtraction holding PENDING suggestions. Nothing here creates
 * Actions - that only happens after explicit human approval.
 */
export async function runAnalysisForDocument(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  actorId?: Types.ObjectId | null;
}): Promise<{ extractionId: string; suggestionCount: number; summary: string }> {
  await connectToDatabase();

  const document = await Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
    deletedAt: null,
  })
    .select('+extractedText displayName status')
    .lean();

  if (!document) throw new NotFoundError('Document');

  const text = (document as unknown as { extractedText?: string }).extractedText ?? '';

  // Claim the document for analysis. Conditional update makes concurrent
  // triggers (double-click, retried job) no-ops instead of duplicate work.
  const claimed = await Document.findOneAndUpdate(
    {
      _id: document._id,
      organizationId: params.organizationId,
      status: { $in: ['EXTRACTED', 'UPLOADED', 'REVIEW', 'COMPLETED', 'FAILED', 'ANALYZING'] },
    },
    {
      $set: {
        status: 'ANALYZING',
        processingStartedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  ).lean();

  if (!claimed) {
    throw new ValidationError('This document is already being analysed.');
  }

  // Guard against a concurrent extraction already in flight for this document.
  const inFlight = await DocumentExtraction.findOne({
    documentId: document._id,
    status: { $in: ['PENDING', 'PROCESSING'] },
  })
    .select('_id')
    .lean();

  if (inFlight) {
    await Document.updateOne(
      { _id: document._id, organizationId: params.organizationId },
      { $set: { status: 'ANALYZING' } },
    );
    throw new ValidationError('An analysis for this document is already running.');
  }

  const startedAt = new Date();
  let extractionId: Types.ObjectId | null = null;

  try {
    const result = await analyzeDocument({
      documentId: String(document._id),
      documentName: document.displayName,
      text,
    });

    const resolved = await resolveAssignees({
      organizationId: params.organizationId,
      names: result.suggestions.map((suggestion) => suggestion.assigneeName),
    });

    const suggestionDocs = result.suggestions.map((suggestion, index) => ({
      suggestionId: `s${index + 1}-${randomSuffix()}`,
      title: suggestion.title,
      description: suggestion.description,
      assigneeName: suggestion.assigneeName,
      assigneeId: suggestion.assigneeName ? (resolved.get(suggestion.assigneeName.toLowerCase()) ?? null) : null,
      dueDate: parseAiDueDate(suggestion.dueDate),
      priority: suggestion.priority,
      actionType: suggestion.actionType,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence,
      sourceLocation: suggestion.sourceLocation,
      status: 'PENDING' as const,
      edited: false,
    }));

    const extraction = await DocumentExtraction.create({
      organizationId: params.organizationId,
      documentId: document._id,
      extractionVersion: EXTRACTION_VERSION,
      promptVersion: result.promptVersion,
      model: result.model,
      status: 'COMPLETED',
      summary: result.summary,
      actions: suggestionDocs,
      rawResult: result.suggestions,
      tokenUsage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
      processingStartedAt: startedAt,
      processingCompletedAt: new Date(),
      createdById: params.actorId ?? null,
    });

    extractionId = extraction._id;

    await Document.updateOne(
      { _id: document._id, organizationId: params.organizationId },
      {
        $set: {
          status: suggestionDocs.length > 0 ? 'REVIEW' : 'COMPLETED',
          summary: result.summary,
          lastExtractionId: extraction._id,
          processingCompletedAt: new Date(),
          failureReason: null,
        },
      },
    );

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorId: params.actorId ?? null,
      action: 'DOCUMENT_ANALYSIS_COMPLETED',
      entityType: 'EXTRACTION',
      entityId: extraction._id,
      metadata: {
        documentId: String(document._id),
        model: result.model,
        promptVersion: result.promptVersion,
        suggestions: suggestionDocs.length,
        droppedSuggestions: result.droppedSuggestions,
      },
    });

    if (suggestionDocs.length > 0) {
      await notifyReviewers({
        organizationId: params.organizationId,
        documentId: String(document._id),
        documentName: document.displayName,
        count: suggestionDocs.length,
      });
    }

    await notifyUploaderDocumentReady({
      organizationId: params.organizationId,
      documentId: String(document._id),
      documentName: document.displayName,
      uploaderId: document.createdById as Types.ObjectId | null,
      suggestionCount: suggestionDocs.length,
    });

    return {
      extractionId: String(extraction._id),
      suggestionCount: suggestionDocs.length,
      summary: result.summary,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    await DocumentExtraction.create({
      organizationId: params.organizationId,
      documentId: document._id,
      extractionVersion: EXTRACTION_VERSION,
      promptVersion: 'unknown',
      model: 'unknown',
      status: 'FAILED',
      error: reason.slice(0, 2000),
      processingStartedAt: startedAt,
      processingCompletedAt: new Date(),
      createdById: params.actorId ?? null,
    }).catch(() => undefined);

    await Document.updateOne(
      { _id: document._id, organizationId: params.organizationId },
      {
        $set: {
          status: 'FAILED',
          failureReason: reason.slice(0, 1000),
          processingCompletedAt: new Date(),
        },
      },
    );

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorId: params.actorId ?? null,
      action: 'DOCUMENT_ANALYSIS_FAILED',
      entityType: 'DOCUMENT',
      entityId: document._id,
      metadata: { reason: reason.slice(0, 500), extractionId: extractionId ? String(extractionId) : null },
    });

    throw error;
  }
}

/**
 * Map AI-provided names to real organization members.
 *
 * Names come from the document and are therefore unreliable. We match on exact
 * email first, then full name, then first name - and we never create a user.
 * Unmatched names stay on the suggestion as display text only.
 */
async function resolveAssignees(params: {
  organizationId: Types.ObjectId;
  names: (string | null)[];
}): Promise<Map<string, Types.ObjectId>> {
  const resolved = new Map<string, Types.ObjectId>();
  const candidates = [...new Set(params.names.filter((name): name is string => Boolean(name)))];

  if (candidates.length === 0) return resolved;

  const memberships = await Membership.find({ organizationId: params.organizationId })
    .populate<{ userId: { _id: Types.ObjectId; name: string; email: string } | null }>('userId', 'name email')
    .lean();

  const members = memberships
    .map((membership) => membership.userId as unknown as { _id: Types.ObjectId; name: string; email: string } | null)
    .filter((user): user is { _id: Types.ObjectId; name: string; email: string } => Boolean(user));

  for (const candidate of candidates) {
    const needle = candidate.toLowerCase().trim();

    const byEmail = members.find((member) => member.email.toLowerCase() === needle);
    if (byEmail) {
      resolved.set(needle, byEmail._id);
      continue;
    }

    const byFullName = members.filter((member) => member.name.toLowerCase() === needle);
    if (byFullName.length === 1) {
      resolved.set(needle, byFullName[0]!._id);
      continue;
    }

    // First-name match only when unambiguous, and only for multi-word needles.
    const byFirstName = members.filter(
      (member) => member.name.toLowerCase().split(/\s+/)[0] === needle.split(/\s+/)[0],
    );
    if (byFirstName.length === 1) {
      resolved.set(needle, byFirstName[0]!._id);
    }
  }

  return resolved;
}

/**
 * Confirm to the uploader that processing finished. Reviewers get their own
 * notification above; this one closes the loop for whoever uploaded the file.
 */
async function notifyUploaderDocumentReady(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  documentName: string;
  uploaderId: Types.ObjectId | null;
  suggestionCount: number;
}): Promise<void> {
  if (!params.uploaderId) return;

  const detail =
    params.suggestionCount > 0
      ? `${params.suggestionCount} suggested action(s) are ready for review.`
      : 'No action items were detected.';

  await createNotification({
    organizationId: params.organizationId,
    userId: params.uploaderId,
    type: 'DOCUMENT_READY',
    title: 'Document processed',
    message: `"${params.documentName}" has been analysed. ${detail}`,
    relatedEntityType: 'DOCUMENT',
    relatedEntityId: new Types.ObjectId(params.documentId),
    // Keyed on the extraction outcome so a re-analysis notifies again, but a
    // retried worker run for the same result does not.
    dedupeKey: `document-ready:${params.documentId}:${params.suggestionCount}`,
  }).catch((error) => {
    if (isDuplicateKeyError(error)) return;
    console.error('[ai] failed to notify uploader', error);
  });
}

/** Tell members who can review that suggestions are waiting. */
async function notifyReviewers(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  documentName: string;
  count: number;
}): Promise<void> {
  const memberships = await Membership.find({
    organizationId: params.organizationId,
    role: { $in: ['OWNER', 'ADMIN', 'MEMBER'] },
  })
    .select('userId')
    .lean();

  await createNotifications(
    memberships.map((membership) => ({
      organizationId: params.organizationId,
      userId: membership.userId as Types.ObjectId,
      type: 'AI_REVIEW_REQUIRED' as const,
      title: 'AI suggestions ready for review',
      message: `${params.count} suggested action(s) were found in "${params.documentName}". Review them to create real work items.`,
      relatedEntityType: 'DOCUMENT' as const,
      relatedEntityId: new Types.ObjectId(params.documentId),
      dedupeKey: `review:${params.documentId}:${params.count}`,
    })),
  ).catch((error) => {
    if (isDuplicateKeyError(error)) return;
    console.error('[ai] failed to notify reviewers', error);
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}