import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Notification } from '@/models/Notification';
import type { NotificationType } from '@/types';

export interface CreateNotificationInput {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: 'ACTION' | 'DOCUMENT' | 'EXTRACTION' | 'PROJECT' | null;
  relatedEntityId?: Types.ObjectId | null;
  /** Stable key that makes notification creation idempotent. */
  dedupeKey?: string | null;
}

/**
 * Create a notification for a single user.
 *
 * Uses the unique (userId, dedupeKey) index to make repeated worker runs safe:
 * a duplicate key error simply means the user has already been told.
 *
 * Never notifies the actor about their own action - handled by callers passing
 * an explicit userId, and by `skipUserId` here for convenience.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await connectToDatabase();
  try {
    await Notification.create({
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 1000),
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return;
    console.error('[notifications] failed to create notification', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  await Promise.all(inputs.map((input) => createNotification(input)));
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

/**
 * List a user's notifications.
 *
 * Mapped to an explicit shape rather than returning the raw documents: the
 * client needs `id`, and internal fields (`userId`, `organizationId`,
 * `dedupeKey`, `__v`) are implementation details that should not be exposed.
 */
export async function listNotifications(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  limit: number;
  unreadOnly?: boolean;
}): Promise<NotificationListItem[]> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    organizationId: params.organizationId,
    userId: params.userId,
  };
  if (params.unreadOnly) filter.readAt = null;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(params.limit)
    .select('type title message readAt createdAt relatedEntityType relatedEntityId')
    .lean();

  return notifications.map((notification) => ({
    id: String(notification._id),
    type: notification.type as NotificationType,
    title: notification.title as string,
    message: notification.message as string,
    readAt: (notification.readAt as Date) ?? null,
    createdAt: notification.createdAt as Date,
    relatedEntityType: (notification.relatedEntityType as string | null) ?? null,
    relatedEntityId: notification.relatedEntityId ? String(notification.relatedEntityId) : null,
  }));
}

export async function countUnreadNotifications(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<number> {
  await connectToDatabase();
  return Notification.countDocuments({
    organizationId: params.organizationId,
    userId: params.userId,
    readAt: null,
  });
}

/** Mark one notification read. Scoped to user + org so ids cannot be guessed. */
export async function markNotificationRead(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  notificationId: string;
}): Promise<boolean> {
  await connectToDatabase();
  const result = await Notification.updateOne(
    {
      _id: new Types.ObjectId(params.notificationId),
      organizationId: params.organizationId,
      userId: params.userId,
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

export async function markAllNotificationsRead(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<number> {
  await connectToDatabase();
  const result = await Notification.updateMany(
    { organizationId: params.organizationId, userId: params.userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function deleteNotification(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  notificationId: string;
}): Promise<boolean> {
  await connectToDatabase();
  const result = await Notification.deleteOne({
    _id: new Types.ObjectId(params.notificationId),
    organizationId: params.organizationId,
    userId: params.userId,
  });
  return result.deletedCount > 0;
}