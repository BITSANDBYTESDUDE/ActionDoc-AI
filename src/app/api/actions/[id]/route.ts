import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { noContent, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { updateActionSchema } from '@/lib/validation/action';
import { deleteAction, getActionDetail, updateAction } from '@/services/action.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/actions/[id] */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  const action = await getActionDetail({
    organizationId: context.organizationId,
    actionId: assertObjectId(id),
  });

  return ok(action);
});

/** PATCH /api/actions/[id] - edit fields, reassign, or change the due date. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const input = updateActionSchema.parse(body);

  const action = await updateAction({
    organizationId: context.organizationId,
    actionId: assertObjectId(id),
    actorId: context.userId,
    actorName: context.userName,
    role: context.role,
    input,
  });

  return ok(action);
});

/** DELETE /api/actions/[id] - soft delete, preserving audit history. */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;

  await deleteAction({
    organizationId: context.organizationId,
    actionId: assertObjectId(id),
    actorId: context.userId,
    actorName: context.userName,
    role: context.role,
  });

  return noContent();
});