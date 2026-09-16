import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';
import { EXTRACTION_VERSION } from '@/config/constants';

export const EXTRACTION_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export const SUGGESTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

/**
 * A single AI suggestion. Embedded inside DocumentExtraction because it is only
 * ever read together with its extraction and never queried independently.
 */
const suggestionSchema = new Schema(
  {
    /** Stable id used by the review UI when approving/rejecting. */
    suggestionId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 4000 },
    assigneeName: { type: String, default: null },
    /** Resolved to a real organization member - never an invented user. */
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    actionType: {
      type: String,
      enum: ['TASK', 'DECISION', 'FOLLOW_UP', 'DEADLINE', 'REMINDER'],
      default: 'TASK',
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    evidence: { type: String, required: true, maxlength: 2000 },
    sourceLocation: { type: String, default: null },

    status: { type: String, enum: SUGGESTION_STATUSES, default: 'PENDING' },
    /**
     * Snapshot of the AI's original values, captured on the first human edit so
     * the reviewer can always see what the model actually proposed. The current
     * values above are the working copy that gets approved.
     */
    original: {
      type: new Schema(
        {
          title: { type: String, required: true },
          description: { type: String, default: '' },
          assigneeName: { type: String, default: null },
          dueDate: { type: Date, default: null },
          priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
        },
        { _id: false },
      ),
      default: null,
    },
    /** True once a human has changed any AI-proposed field. */
    edited: { type: Boolean, default: false },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    /** Set once approved so duplicate approval can be prevented. */
    actionId: { type: Schema.Types.ObjectId, ref: 'Action', default: null },
  },
  { _id: false },
);

const documentExtractionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },

    extractionVersion: { type: String, default: EXTRACTION_VERSION },
    promptVersion: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: String, enum: EXTRACTION_STATUSES, default: 'PENDING' },

    summary: { type: String, default: '' },
    actions: { type: [suggestionSchema], default: [] },
    /** Raw provider payload retained for debugging; never returned to clients. */
    rawResult: { type: Schema.Types.Mixed, select: false },
    tokenUsage: {
      promptTokens: { type: Number, default: null },
      completionTokens: { type: Number, default: null },
      totalTokens: { type: Number, default: null },
    },

    processingStartedAt: { type: Date, default: null },
    processingCompletedAt: { type: Date, default: null },
    error: { type: String, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'documentextractions' },
);

documentExtractionSchema.index({ organizationId: 1, createdAt: -1 });
documentExtractionSchema.index({ organizationId: 1, documentId: 1, createdAt: -1 });
documentExtractionSchema.index({ organizationId: 1, status: 1 });
// A document should only have one in-flight extraction at a time; the worker
// checks this index before starting to keep jobs idempotent.
documentExtractionSchema.index(
  { documentId: 1, status: 1 },
  { partialFilterExpression: { status: 'PROCESSING' }, name: 'one_processing_extraction_per_document' },
);

export type SuggestionDocument = InferSchemaType<typeof suggestionSchema>;
export type DocumentExtractionDocument = InferSchemaType<typeof documentExtractionSchema> & {
  _id: Types.ObjectId;
};
export type DocumentExtractionModel = Model<DocumentExtractionDocument>;

export const DocumentExtraction: DocumentExtractionModel =
  (mongoose.models.DocumentExtraction as DocumentExtractionModel) ??
  mongoose.model<DocumentExtractionDocument>('DocumentExtraction', documentExtractionSchema);