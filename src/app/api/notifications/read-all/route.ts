import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { markAllNotificationsRead } from '@/services/notification.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/read-all
 *
 * Mark every notification for the current user in the current organization as
 * read. The update is scoped by userId, so it can only ever touch the caller's
 * own rows.
 */
export const POST = withApiErrorHandling(async () => {
  const context = await requireOrganizationMembership('VIEWER');

  const updated = await markAllNotificationsRead({
    organizationId: context.organizationId,
    userId: context.userId,
  });

  return ok({ updated });
});