import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { changeStatusSchema } from '@/lib/validation/action';
import { changeActionStatus } from '@/services/action.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/actions/[id]/status
 *
 * Status is a separate endpoint because transitions are constrained: the
 * service rejects illegal moves and sets/clears `completedAt` accordingly.
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const { status } = changeStatusSchema.parse(body);

  const action = await changeActionStatus({
    organizationId: context.organizationId,
    actionId: assertObjectId(id),
    actorId: context.userId,
    actorName: context.userName,
    role: context.role,
    status,
  });

  return ok(action);
});