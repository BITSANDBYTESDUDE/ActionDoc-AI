import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { getDashboardData } from '@/services/dashboard.service';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard - organization-scoped statistics and recent activity. */
export const GET = withApiErrorHandling(async () => {
  const context = await requireOrganizationMembership('VIEWER');

  const data = await getDashboardData({
    organizationId: context.organizationId,
    userId: context.userId,
  });

  return ok(data);
});