import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

export const DOCUMENT_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'EXTRACTED',
  'ANALYZING',
  'REVIEW',
  'COMPLETED',
  'FAILED',
] as const;

export const DOCUMENT_SOURCE_TYPES = ['PDF', 'DOCX', 'TXT', 'MARKDOWN'] as const;

const documentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    originalName: { type: String, required: true, maxlength: 512 },
    displayName: { type: String, required: true, maxlength: 512 },
    mimeType: { type: String, required: true },
    sourceType: { type: String, enum: DOCUMENT_SOURCE_TYPES, required: true },
    fileSize: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true },
    /** SHA-256 of the raw bytes - used for duplicate detection within an org. */
    fileHash: { type: String, required: true, index: true },

    status: { type: String, enum: DOCUMENT_STATUSES, default: 'UPLOADED', index: true },
    /** Short AI/human summary of the document. */
    summary: { type: String, default: '' },
    /** Normalised extracted text. Kept on the parent doc for search + re-analysis. */
    extractedText: { type: String, default: '', select: false },
    metadata: {
      pageCount: { type: Number, default: null },
      wordCount: { type: Number, default: null },
      charCount: { type: Number, default: null },
      extractionMethod: { type: String, default: null },
      warnings: { type: [String], default: [] },
    },

    processingStartedAt: { type: Date, default: null },
    processingCompletedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    lastExtractionId: { type: Schema.Types.ObjectId, ref: 'DocumentExtraction', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'documents' },
);

// Query-pattern driven indexes.
documentSchema.index({ organizationId: 1, createdAt: -1 });
documentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
documentSchema.index({ organizationId: 1, sourceType: 1, createdAt: -1 });
documentSchema.index({ organizationId: 1, fileHash: 1 });
documentSchema.index({ organizationId: 1, createdById: 1, createdAt: -1 });
documentSchema.index({ displayName: 'text', summary: 'text' }, { name: 'document_text_search' });

export type DocumentDocument = InferSchemaType<typeof documentSchema> & { _id: Types.ObjectId };
export type DocumentModel = Model<DocumentDocument>;

export const Document: DocumentModel =
  (mongoose.models.Document as DocumentModel) ?? mongoose.model<DocumentDocument>('Document', documentSchema);