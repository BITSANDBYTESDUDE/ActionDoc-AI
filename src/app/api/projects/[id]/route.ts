import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { updateProjectSchema } from '@/lib/validation/project';
import { archiveProject, getProjectDetail, listActionsForProject, updateProject } from '@/services/project.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] - project detail with its actions. */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;
  const projectId = assertObjectId(id);

  const [project, actions] = await Promise.all([
    getProjectDetail({ organizationId: context.organizationId, projectId }),
    listActionsForProject({ organizationId: context.organizationId, projectId, limit: 200 }),
  ]);

  return ok({ project, actions });
});

/** PATCH /api/projects/[id] - update fields or archive via `status: 'ARCHIVED'`. */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;
  const projectId = assertObjectId(id);

  const body = await request.json().catch(() => null);
  const input = updateProjectSchema.parse(body);

  const project = await updateProject({
    organizationId: context.organizationId,
    projectId,
    actorId: context.userId,
    actorName: context.userName,
    input,
  });

  return ok(project);
});

/**
 * DELETE /api/projects/[id]
 *
 * Archiving rather than hard deletion: open actions are detached from the
 * project first so nothing is silently orphaned or lost. Only OWNER and ADMIN
 * may archive.
 */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('ADMIN');
  const { id } = await params;
  const projectId = assertObjectId(id);

  const result = await archiveProject({
    organizationId: context.organizationId,
    projectId,
    actorId: context.userId,
    actorName: context.userName,
  });

  return ok({ projectId, archived: true, ...result });
});