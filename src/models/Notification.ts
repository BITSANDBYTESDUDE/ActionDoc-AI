import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'ACTION_ASSIGNED',
  'ACTION_DUE_SOON',
  'ACTION_OVERDUE',
  'ACTION_COMPLETED',
  'DOCUMENT_READY',
  'AI_REVIEW_REQUIRED',
] as const;

export const RELATED_ENTITY_TYPES = ['ACTION', 'DOCUMENT', 'EXTRACTION', 'PROJECT'] as const;

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Notifications are always addressed to exactly one user. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    relatedEntityType: { type: String, enum: RELATED_ENTITY_TYPES, default: null },
    relatedEntityId: { type: Schema.Types.ObjectId, default: null },
    /** De-duplication key so repeated worker runs don't spam users. */
    dedupeKey: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, organizationId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & { _id: Types.ObjectId };
export type NotificationModel = Model<NotificationDocument>;

export const Notification: NotificationModel =
  (mongoose.models.Notification as NotificationModel) ??
  mongoose.model<NotificationDocument>('Notification', notificationSchema);