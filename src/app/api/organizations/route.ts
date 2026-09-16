import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { createOrganizationSchema } from '@/lib/validation/organization';
import { createOrganization, listOrganizationsForUser } from '@/services/organization.service';

export const dynamic = 'force-dynamic';

/** GET /api/organizations - organizations the caller belongs to. */
export const GET = withApiErrorHandling(async () => {
  const user = await requireAuth();
  return ok(await listOrganizationsForUser(user.id));
});

/**
 * POST /api/organizations
 *
 * Creates a workspace and makes the caller its primary owner. There is no
 * "organization id" input: the service derives ownership from the session.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth();

  const body = await request.json().catch(() => null);
  const { name } = createOrganizationSchema.parse(body);

  const organization = await createOrganization({
    userId: user.id,
    userName: user.name,
    name,
  });

  return created(organization);
});