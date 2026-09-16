import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { listMembers, addMember } from '@/services/organization.service';
import { assertObjectId } from '@/lib/validation/common';
import { userRoleSchema } from '@/lib/validation/organization';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/organizations/[id]/members
 *
 * The route id is verified against the caller's own active organization rather
 * than trusted, so a member cannot enumerate another tenant's members.
 */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;
  const requested = assertObjectId(id);

  if (requested !== String(context.organizationId)) {
    // Deliberately indistinguishable from "no such organization".
    return ok([]);
  }

  const members = await listMembers(context.organizationId);
  return ok(members);
});

/** POST /api/organizations/[id]/members - add an existing account to the org. */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('ADMIN');
  const { id } = await params;

  if (assertObjectId(id) !== String(context.organizationId)) {
    throw new NotFoundError('Organization');
  }

  const body = await request.json().catch(() => null);
  const input = z
    .object({
      email: z.string().email('A valid email address is required.'),
      role: userRoleSchema,
    })
    .parse(body);

  const member = await addMember({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    email: input.email,
    role: input.role,
  });

  return created(member);
});