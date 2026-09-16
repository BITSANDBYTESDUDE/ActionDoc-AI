import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { switchOrganizationSchema } from '@/lib/validation/organization';
import { listOrganizationsForUser } from '@/services/organization.service';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/constants';
import { ForbiddenError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/organizations/switch
 *
 * Switch the active organization. The target is verified against the caller's
 * memberships *before* the cookie is written, so the cookie can never point at
 * an organization the user does not belong to.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth();

  const body = await request.json().catch(() => null);
  const { organizationId } = switchOrganizationSchema.parse(body);

  const organizations = await listOrganizationsForUser(user.id);
  const target = organizations.find((organization) => organization.id === organizationId);
  if (!target) throw new ForbiddenError('You do not have access to this organization.');

  const response = ok({ organization: target });

  response.cookies.set({
    name: ACTIVE_ORG_COOKIE,
    value: organizationId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
});

/** GET /api/organizations/switch - organizations available to the caller. */
export const GET = withApiErrorHandling(async () => {
  const user = await requireAuth();
  const organizations = await listOrganizationsForUser(user.id);
  return ok(organizations);
});