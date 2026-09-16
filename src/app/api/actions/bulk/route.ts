import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { bulkActionSchema } from '@/lib/validation/action';
import { bulkUpdateActions } from '@/services/action.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/actions/bulk - apply one change to many actions.
 *
 * Returns 200 with a per-item report rather than failing the whole request:
 * a batch is a convenience, and a single disallowed status transition should
 * not roll back the changes that were valid. `succeeded` and `failed` let the
 * UI show exactly what happened.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  // VIEWER is rejected inside the service for every operation, but gating here
  // keeps the role check and rate limit alongside the single-action routes.
  const context = await requireOrganizationMembership('MEMBER');
  await enforceRateLimit({ key: `actions:bulk:${context.userId}`, limit: 20, windowSeconds: 60 });

  const body = await request.json().catch(() => null);
  const input = bulkActionSchema.parse(body);

  const result = await bulkUpdateActions({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    role: context.role,
    actionIds: input.actionIds,
    operation: input.operation,
    status: input.operation === 'status' ? input.status : undefined,
    assigneeId: input.operation === 'assign' ? input.assigneeId : undefined,
    priority: input.operation === 'priority' ? input.priority : undefined,
  });

  return ok(result);
});