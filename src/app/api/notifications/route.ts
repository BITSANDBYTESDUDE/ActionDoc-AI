import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import {
  countUnreadNotifications,
  listNotifications,
} from '@/services/notification.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 *
 * Notifications are per-user, and the query is scoped by both `organizationId`
 * and `userId` so a member can never read another user's notifications.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('VIEWER');

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 25) || 25, 100);
  const unreadOnly = request.nextUrl.searchParams.get('unread') === 'true';

  const [items, unreadCount] = await Promise.all([
    listNotifications({
      organizationId: context.organizationId,
      userId: context.userId,
      limit,
      unreadOnly,
    }),
    countUnreadNotifications({ organizationId: context.organizationId, userId: context.userId }),
  ]);

  return ok({ items, unreadCount });
});