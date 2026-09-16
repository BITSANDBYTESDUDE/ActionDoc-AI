import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { documentListQuerySchema } from '@/lib/validation/document';
import { validateUpload } from '@/lib/storage/keys';
import {
  createDocumentFromUpload,
  getMaxUploadBytes,
  listDocuments,
} from '@/services/document.service';
import { enqueueDocumentProcessing } from '@/lib/queue/document.queue';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/documents - server-side paginated, filtered, organization-scoped. */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('VIEWER');

  const query = documentListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  const result = await listDocuments({ organizationId: context.organizationId, query });
  return ok(result);
});

/**
 * POST /api/documents - multipart upload.
 *
 * The file is validated (size, extension, MIME, magic bytes), hashed for
 * duplicate detection, stored privately, then queued for processing. The
 * request never blocks on extraction or AI analysis.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('MEMBER');

  // Uploads are expensive (storage + AI); throttle per user.
  await enforceRateLimit({ key: `documents:upload:${context.userId}`, limit: 30, windowSeconds: 60 });

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw new ValidationError('Expected a multipart/form-data upload.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new ValidationError('No file was included in the request.', [
      { path: 'file', message: 'A file is required.' },
    ]);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const validated = validateUpload({
    fileName: file.name,
    mimeType: file.type,
    bytes,
    maxBytes: getMaxUploadBytes(),
  });

  const document = await createDocumentFromUpload({
    organizationId: context.organizationId,
    userId: context.userId,
    userName: context.userName,
    file: { ...validated, bytes },
  });

  const processing = await enqueueDocumentProcessing({
    organizationId: String(context.organizationId),
    documentId: document.id,
    requestedById: String(context.userId),
    reason: 'upload',
  });

  return created({ document, processing });
});