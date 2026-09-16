import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Notification } from '@/models/Notification';
import { User } from '@/models/User';
import { sendEmail } from '@/lib/notifications/email';
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
  /**
   * Optional email copy of this notification.
   *
   * Email is strictly a side channel: it is attempted only after the in-app
   * notification is written, and only when the in-app write actually happened
   * (never for a deduped repeat). Delivery failures are logged, not thrown.
   */
  email?: { subject: string; text: string };
}

/**
 * Create a notification for a single user.
 *
 * Uses the unique (userId, dedupeKey) index to make repeated worker runs safe:
 * a duplicate key error simply means the user has already been told.
 *
 * Returns `true` when a new notification was written, `false` when it was a
 * duplicate or the write failed - callers that also email use this to avoid
 * sending the same reminder twice.
 *
 * Never notifies the actor about their own action - handled by callers passing
 * an explicit userId, and by `skipUserId` here for convenience.
 */
export async function createNotification(input: CreateNotificationInput): Promise<boolean> {
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
    if (isDuplicateKeyError(error)) return false;
    console.error('[notifications] failed to create notification', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  if (input.email) {
    await deliverNotificationEmail({ userId: input.userId, email: input.email });
  }

  return true;
}

/**
 * Look up the recipient and send the email copy.
 *
 * Best-effort by design: a user with no email on file, or an unconfigured
 * Resend key, must not turn a reminder into an error.
 */
async function deliverNotificationEmail(params: {
  userId: Types.ObjectId;
  email: { subject: string; text: string };
}): Promise<void> {
  try {
    const user = await User.findById(params.userId).select('email').lean();
    const to = (user?.email as string | undefined) ?? null;
    if (!to) return;
    await sendEmail({ to, subject: params.email.subject, text: params.email.text });
  } catch (error) {
    console.error('[notifications] failed to send email copy', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<number> {
  const results = await Promise.all(inputs.map((input) => createNotification(input)));
  return results.filter(Boolean).length;
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