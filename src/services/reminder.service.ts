import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Action } from '@/models/Action';
import { createNotifications } from '@/services/notification.service';

/**
 * Deadline notifications.
 *
 * `ACTION_DUE_SOON` and `ACTION_OVERDUE` are derived from state rather than
 * raised by a user action, so they are produced by a scheduled sweep instead of
 * inline in the request path. The sweep is idempotent: each notification is
 * keyed by `(action, assignee, deadline-kind, dueDate)`, so re-running it - or
 * running two instances concurrently - never double-notifies.
 *
 * The due date is part of the key on purpose: if a task is rescheduled, the
 * assignee should be told about the new deadline.
 */

/** How far ahead "due soon" looks. */
const DUE_SOON_WINDOW_HOURS = 24;
/** Open statuses are the only ones where a deadline still matters. */
const OPEN_STATUSES = ['TODO', 'IN_PROGRESS'] as const;

export interface ReminderSweepResult {
  dueSoon: number;
  overdue: number;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Dedupe keys embed the *exact* due timestamp, not just the date: a task pushed
 * from 09:00 to 17:00 the same day is a real change the assignee should hear
 * about, while a retried sweep for an unchanged deadline must stay silent.
 */
function dedupeSuffix(actionId: unknown, assigneeId: unknown, dueDate: Date): string {
  return `${String(actionId)}:${String(assigneeId)}:${new Date(dueDate).toISOString()}`;
}

/**
 * Scan every organization for actions whose deadlines have become relevant and
 * notify the assignee. Safe to call repeatedly.
 */
export async function runDeadlineSweep(params?: {
  now?: Date;
  /** Restrict the sweep to one organization (useful in tests). */
  organizationId?: Types.ObjectId;
}): Promise<ReminderSweepResult> {
  await connectToDatabase();

  const now = params?.now ?? new Date();
  const soonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_HOURS * 3600 * 1000);

  const scope: Record<string, unknown> = {
    status: { $in: OPEN_STATUSES },
    dueDate: { $ne: null },
    // An unassigned action has nobody to notify.
    assigneeId: { $ne: null },
  };
  if (params?.organizationId) scope.organizationId = params.organizationId;

  // Overdue includes anything whose deadline has been reached (`$lte`), so an
  // action due at the exact instant of the sweep is reported rather than falling
  // into a gap between the two windows.
  const overdue = await Action.find({ ...scope, dueDate: { $lte: now } })
    .select('organizationId assigneeId title dueDate')
    .lean();

  // Due soon: strictly after now, up to the cutoff. Disjoint from overdue above,
  // so no action can be notified as both.
  const dueSoon = await Action.find({ ...scope, dueDate: { $gt: now, $lte: soonCutoff } })
    .select('organizationId assigneeId title dueDate')
    .lean();

  const overdueNotifications = overdue.map((action) => ({
    organizationId: action.organizationId as Types.ObjectId,
    userId: action.assigneeId as Types.ObjectId,
    type: 'ACTION_OVERDUE' as const,
    title: 'Action overdue',
    message: `"${action.title}" was due on ${dayKey(action.dueDate as Date)} and is still open.`,
    relatedEntityType: 'ACTION' as const,
    relatedEntityId: action._id as Types.ObjectId,
    dedupeKey: `overdue:${dedupeSuffix(action._id, action.assigneeId, action.dueDate as Date)}`,
    email: {
      subject: `Overdue: ${action.title}`,
      text:
        `"${action.title}" was due on ${dayKey(action.dueDate as Date)} and is still open.\n\n` +
        'Open ActionDoc AI to update its status or due date.',
    },
  }));

  const dueSoonNotifications = dueSoon.map((action) => ({
    organizationId: action.organizationId as Types.ObjectId,
    userId: action.assigneeId as Types.ObjectId,
    type: 'ACTION_DUE_SOON' as const,
    title: 'Action due soon',
    message: `"${action.title}" is due on ${dayKey(action.dueDate as Date)}.`,
    relatedEntityType: 'ACTION' as const,
    relatedEntityId: action._id as Types.ObjectId,
    dedupeKey: `due-soon:${dedupeSuffix(action._id, action.assigneeId, action.dueDate as Date)}`,
    email: {
      subject: `Due soon: ${action.title}`,
      text: `"${action.title}" is due on ${dayKey(action.dueDate as Date)}.`,
    },
  }));

  // Counts reflect notifications actually written, so a re-run that dedupes
  // everything reports zero rather than the size of the candidate set.
  const writtenOverdue = await createNotifications(overdueNotifications);
  const writtenDueSoon = await createNotifications(dueSoonNotifications);

  return { dueSoon: writtenDueSoon, overdue: writtenOverdue };
}