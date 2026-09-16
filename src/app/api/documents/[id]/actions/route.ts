import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { listActionsForDocument } from '@/services/action.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/[id]/actions
 *
 * Confirmed actions that originated from this document. AI suggestions are
 * deliberately not included here - they live on the extraction, under review.
 */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  const actions = await listActionsForDocument({
    organizationId: context.organizationId,
    documentId: assertObjectId(id),
  });

  return ok(actions);
});