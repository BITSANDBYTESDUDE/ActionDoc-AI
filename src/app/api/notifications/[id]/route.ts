import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { noContent, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { NotFoundError } from '@/lib/errors';
import {
  deleteNotification,
  markNotificationRead,
} from '@/services/notification.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH /api/notifications/[id] - mark one notification as read. */
export const PATCH = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  const updated = await markNotificationRead({
    organizationId: context.organizationId,
    userId: context.userId,
    notificationId: assertObjectId(id),
  });

  if (!updated) throw new NotFoundError('Notification');

  return ok({ id, read: true });
});

/** DELETE /api/notifications/[id] */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  const deleted = await deleteNotification({
    organizationId: context.organizationId,
    userId: context.userId,
    notificationId: assertObjectId(id),
  });

  if (!deleted) throw new NotFoundError('Notification');

  return noContent();
});