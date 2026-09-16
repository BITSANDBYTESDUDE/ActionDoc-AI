import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { noContent, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { userRoleSchema } from '@/lib/validation/organization';
import { removeMember, updateMemberRole } from '@/services/organization.service';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

function assertActiveOrganization(contextOrganizationId: unknown, routeId: string): string {
  const parsed = assertObjectId(routeId);
  if (parsed !== String(contextOrganizationId)) throw new NotFoundError('Organization');
  return parsed;
}

/** PATCH /api/organizations/[id]/members/[memberId] - change a member's role. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('ADMIN');
  const { id, memberId } = await params;
  assertActiveOrganization(context.organizationId, id);

  const body = await request.json().catch(() => null);
  const { role } = z.object({ role: userRoleSchema }).parse(body);

  await updateMemberRole({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    membershipId: assertObjectId(memberId, 'memberId'),
    role,
  });

  return ok({ membershipId: memberId, role });
});

/** DELETE /api/organizations/[id]/members/[memberId] - remove a member. */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('ADMIN');
  const { id, memberId } = await params;
  assertActiveOrganization(context.organizationId, id);

  await removeMember({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    membershipId: assertObjectId(memberId, 'memberId'),
  });

  return noContent();
});