import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createProjectSchema, projectListQuerySchema } from '@/lib/validation/project';
import { createProject, listProjectOptions, listProjects } from '@/services/project.service';

export const dynamic = 'force-dynamic';

/** GET /api/projects - paginated list, or `?options=true` for selector data. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('VIEWER');

  if (request.nextUrl.searchParams.get('options') === 'true') {
    const options = await listProjectOptions(context.organizationId);
    return ok(options);
  }

  const query = projectListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const result = await listProjects({ organizationId: context.organizationId, query });
  return ok(result);
});

/** POST /api/projects */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('MEMBER');
  await enforceRateLimit({ key: `projects:create:${context.userId}`, limit: 30, windowSeconds: 60 });

  const body = await request.json().catch(() => null);
  const input = createProjectSchema.parse(body);

  const project = await createProject({
    organizationId: context.organizationId,
    actorId: context.userId,
    actorName: context.userName,
    input,
  });

  return created(project);
});