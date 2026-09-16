import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { updateOrganizationSchema } from '@/lib/validation/organization';
import { getOrganization, updateOrganization } from '@/services/organization.service';
import { assertObjectId } from '@/lib/validation/common';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/organizations/[id]
 *
 * The id is compared against the caller's verified active organization. A
 * mismatch is reported as "not found" so the endpoint cannot be used to probe
 * which organizations exist.
 */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  if (assertObjectId(id) !== String(context.organizationId)) throw new NotFoundError('Organization');

  const organization = await getOrganization(context.organizationId);
  return ok({
    id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    role: context.role,
    createdAt: organization.createdAt,
    settings: organization.settings,
  });
});

/** PATCH /api/organizations/[id] - rename and update workspace settings. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('ADMIN');
  const { id } = await params;

  if (assertObjectId(id) !== String(context.organizationId)) throw new NotFoundError('Organization');

  const body = await request.json().catch(() => null);
  const input = updateOrganizationSchema.parse(body);

  await updateOrganization({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    ...input,
  });

  const organization = await getOrganization(context.organizationId);
  return ok({
    id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    role: context.role,
  });
});