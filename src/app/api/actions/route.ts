import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { actionListQuerySchema, createActionSchema } from '@/lib/validation/action';
import { createAction, getActionViewCounts, listActions } from '@/services/action.service';

export const dynamic = 'force-dynamic';

/** GET /api/actions - organization-scoped, paginated, filtered. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('VIEWER');

  const query = actionListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));

  const [result, counts] = await Promise.all([
    listActions({
      organizationId: context.organizationId,
      userId: context.userId,
      query,
    }),
    // Counts power the view tabs; returned alongside so the UI needs one call.
    getActionViewCounts({ organizationId: context.organizationId, userId: context.userId }),
  ]);

  return ok({ ...result, counts });
});

/** POST /api/actions - create an action directly, without an AI suggestion. */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('MEMBER');
  await enforceRateLimit({ key: `actions:create:${context.userId}`, limit: 60, windowSeconds: 60 });

  const body = await request.json().catch(() => null);
  const input = createActionSchema.parse(body);

  const action = await createAction({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    input,
  });

  return created(action);
});