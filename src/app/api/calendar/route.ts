import { NextRequest } from 'next/server';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { ok, withApiErrorHandling } from '@/lib/utils/api-response';
import { getCalendarActions } from '@/services/dashboard.service';
import { assertObjectId } from '@/lib/validation/common';
import { actionStatusSchema } from '@/lib/validation/action';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 400;

/**
 * GET /api/calendar?from=&to=
 *
 * Returns actions with due dates in the requested window. The range is bounded
 * so a client cannot request an unbounded scan of the collection.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const context = await requireOrganizationMembership('VIEWER');

  const params = request.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');

  if (!from || !to) {
    throw new ValidationError('Both "from" and "to" dates are required.', [
      { path: 'from', message: 'A start date is required.' },
    ]);
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new ValidationError('The supplied date range is not valid.');
  }
  if (toDate.getTime() < fromDate.getTime()) {
    throw new ValidationError('The end date must be after the start date.');
  }

  const rangeDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new ValidationError(`The date range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  const assigneeId = params.get('assigneeId');
  const projectId = params.get('projectId');
  const status = params.get('status');

  const actions = await getCalendarActions({
    organizationId: context.organizationId,
    from: fromDate,
    to: toDate,
    assigneeId: assigneeId ? assertObjectId(assigneeId, 'assigneeId') : undefined,
    projectId: projectId ? assertObjectId(projectId, 'projectId') : undefined,
    status: status ? actionStatusSchema.parse(status) : undefined,
  });

  return ok(actions);
});