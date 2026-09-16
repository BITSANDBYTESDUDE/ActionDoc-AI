import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { assertObjectId } from '@/lib/validation/common';
import { assertDocumentInOrganization } from '@/services/document.service';
import { enqueueDocumentProcessing } from '@/lib/queue/document.queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/documents/[id]/analyze
 *
 * Re-runs extraction and AI analysis. Useful when a document previously failed,
 * when a newer prompt version is deployed, or when a reviewer cleared the
 * suggestions. The work itself happens in the worker so the request returns
 * immediately.
 */
export const POST = withApiErrorHandling(async (_request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;
  const documentId = assertObjectId(id);

  // Analyses cost money; keep a firm per-user ceiling.
  await enforceRateLimit({ key: `documents:analyze:${context.userId}`, limit: 20, windowSeconds: 300 });

  await assertDocumentInOrganization({ organizationId: context.organizationId, documentId });

  const processing = await enqueueDocumentProcessing({
    organizationId: String(context.organizationId),
    documentId,
    requestedById: String(context.userId),
    reason: 'manual',
  });

  return ok({ documentId, processing });
});