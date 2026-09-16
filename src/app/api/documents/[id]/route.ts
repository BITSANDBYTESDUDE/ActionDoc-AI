import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { assertObjectId } from '@/lib/validation/common';
import { deleteDocument, getDocumentDetail } from '@/services/document.service';
import { getLatestExtraction } from '@/services/extraction.service';
import { listActionsForDocument } from '@/services/action.service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/documents/[id] - detail plus the review queue for the document. */
export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;
  const documentId = assertObjectId(id);

  const [document, extraction, actions] = await Promise.all([
    getDocumentDetail({ organizationId: context.organizationId, documentId }),
    getLatestExtraction({ organizationId: context.organizationId, documentId }),
    listActionsForDocument({ organizationId: context.organizationId, documentId }),
  ]);

  return ok({
    document,
    // `rawResult` is excluded by the schema's `select: false`, so the raw model
    // payload can never leak through this endpoint.
    extraction,
    actions,
  });
});

/** DELETE /api/documents/[id] - soft delete, storage cleanup and audit log. */
export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;
  const documentId = assertObjectId(id);

  await deleteDocument({
    organizationId: context.organizationId,
    documentId,
    actorId: context.userId,
    actorName: context.userName,
  });

  return ok({ id: documentId, deleted: true });
});