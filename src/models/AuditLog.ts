import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'ORGANIZATION_CREATED',
  'ORGANIZATION_UPDATED',
  'MEMBER_ADDED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
  'DOCUMENT_ANALYSIS_STARTED',
  'DOCUMENT_ANALYSIS_COMPLETED',
  'DOCUMENT_ANALYSIS_FAILED',
  'SUGGESTION_APPROVED',
  'SUGGESTION_REJECTED',
  'ACTION_CREATED',
  'ACTION_UPDATED',
  'ACTION_ASSIGNED',
  'ACTION_STATUS_CHANGED',
  'ACTION_DELETED',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'SETTINGS_UPDATED',
] as const;

/**
 * Append-only audit trail. The service layer only ever inserts; there is no
 * update/delete path exposed anywhere in the application.
 */
const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    /** Deliberately small + non-sensitive: ids, names, statuses only. */
    metadata: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'auditlogs' },
);

auditLogSchema.index({ organizationId: 1, timestamp: -1 });
auditLogSchema.index({ organizationId: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, timestamp: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };
export type AuditLogModel = Model<AuditLogDocument>;

export const AuditLog: AuditLogModel =
  (mongoose.models.AuditLog as AuditLogModel) ?? mongoose.model<AuditLogDocument>('AuditLog', auditLogSchema);