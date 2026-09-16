import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

export const ACTION_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const ACTION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const ACTION_TYPES = ['TASK', 'DECISION', 'FOLLOW_UP', 'DEADLINE', 'REMINDER'] as const;

const actionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    // Provenance - present only when the action came from an approved suggestion.
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    extractionId: { type: Schema.Types.ObjectId, ref: 'DocumentExtraction', default: null },
    suggestionId: { type: String, default: null },

    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 5000 },
    status: { type: String, enum: ACTION_STATUSES, default: 'TODO' },
    priority: { type: String, enum: ACTION_PRIORITIES, default: 'MEDIUM' },
    actionType: { type: String, enum: ACTION_TYPES, default: 'TASK' },

    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    aiGenerated: { type: Boolean, default: false },
    aiConfidence: { type: Number, min: 0, max: 1, default: null },
    aiModel: { type: String, default: null },
    promptVersion: { type: String, default: null },
    evidence: { type: String, default: null, maxlength: 2000 },
    sourceLocation: { type: String, default: null },

    /** Set when a document is deleted so the action keeps its audit trail. */
    sourceDocumentName: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'actions' },
);

actionSchema.index({ organizationId: 1, createdAt: -1 });
actionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
actionSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
actionSchema.index({ organizationId: 1, dueDate: 1, status: 1 });
actionSchema.index({ organizationId: 1, projectId: 1, status: 1 });
actionSchema.index({ organizationId: 1, priority: 1, createdAt: -1 });
actionSchema.index({ organizationId: 1, aiGenerated: 1, createdAt: -1 });
actionSchema.index({ organizationId: 1, documentId: 1 });
actionSchema.index({ title: 'text', description: 'text' }, { name: 'action_text_search' });

export type ActionDocument = InferSchemaType<typeof actionSchema> & { _id: Types.ObjectId };
export type ActionModel = Model<ActionDocument>;

export const Action: ActionModel =
  (mongoose.models.Action as ActionModel) ?? mongoose.model<ActionDocument>('Action', actionSchema);