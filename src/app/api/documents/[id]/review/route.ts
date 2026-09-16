import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { created, ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { enforceRateLimit } from '@/lib/rate-limit';
import { assertObjectId } from '@/lib/validation/common';
import {
  approveSuggestionSchema,
  editSuggestionSchema,
  rejectSuggestionSchema,
} from '@/lib/validation/action';
import { approveSuggestion, editSuggestion, rejectSuggestion } from '@/services/action.service';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), suggestionId: z.string().min(1) }).merge(approveSuggestionSchema),
  z
    .object({ decision: z.literal('reject'), suggestionId: z.string().min(1) })
    .merge(rejectSuggestionSchema),
]);

/**
 * POST /api/documents/[id]/review
 *
 * The single entry point for a human decision on an AI suggestion. Approval is
 * the only path that creates an Action, and it happens in the service layer
 * inside a transaction with a conditional claim on the suggestion.
 */
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;
  const documentId = assertObjectId(id);

  await enforceRateLimit({ key: `review:${context.userId}`, limit: 120, windowSeconds: 60 });

  const body = await request.json().catch(() => null);
  if (!body) throw new ValidationError('A JSON body is required.');

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('The review decision is invalid.', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }

  if (parsed.data.decision === 'approve') {
    const result = await approveSuggestion({
      organizationId: context.organizationId,
      documentId,
      suggestionId: parsed.data.suggestionId,
      actorId: context.userId,
      actorName: context.userName,
      projectId: parsed.data.projectId ?? null,
    });
    return created(result);
  }

  await rejectSuggestion({
    organizationId: context.organizationId,
    documentId,
    suggestionId: parsed.data.suggestionId,
    actorId: context.userId,
    actorName: context.userName,
    rejectionReason: parsed.data.rejectionReason,
  });

  return ok({ suggestionId: parsed.data.suggestionId, status: 'REJECTED' });
});

/**
 * PATCH /api/documents/[id]/review
 *
 * Edit a pending suggestion before approving it. The original AI values stay in
 * the extraction's `rawResult` so the suggestion remains auditable.
 */
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: RouteParams) => {
  const context = await requireOrganizationMembership('MEMBER');
  const { id } = await params;
  const documentId = assertObjectId(id);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new ValidationError('A JSON body is required.');

  const { suggestionId, ...edits } = body as Record<string, unknown>;
  if (typeof suggestionId !== 'string' || suggestionId.length === 0) {
    throw new ValidationError('A suggestionId is required.');
  }

  const parsed = editSuggestionSchema.safeParse(edits);
  if (!parsed.success) {
    throw new ValidationError('The suggestion edits are invalid.', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }

  await editSuggestion({
    organizationId: context.organizationId,
    documentId,
    suggestionId,
    actorId: context.userId,
    actorName: context.userName,
    input: parsed.data,
  });

  return ok({ suggestionId, updated: true });
});