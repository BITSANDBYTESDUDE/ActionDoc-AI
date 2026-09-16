import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Action } from '@/models/Action';
import { Document } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { AuditLog } from '@/models/AuditLog';
import type { ActionPriority, ActionStatus, DocumentStatus } from '@/types';

export interface DashboardStats {
  documents: {
    total: number;
    processing: number;
    review: number;
    failed: number;
  };
  actions: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    upcoming: number;
  };
  ai: {
    extractionsLast7Days: number;
    suggestionsAwaitingReview: number;
    suggestionsApproved: number;
    suggestionsRejected: number;
    approvalRate: number | null;
  };
}

export interface RecentDocument {
  id: string;
  displayName: string;
  sourceType: string;
  status: DocumentStatus;
  createdAt: Date;
  pageCount: number | null;
  wordCount: number | null;
}

export interface UpcomingAction {
  id: string;
  title: string;
  status: ActionStatus;
  priority: ActionPriority;
  dueDate: Date | null;
  assigneeName: string | null;
  aiGenerated: boolean;
}

export interface RecentActivity {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface DashboardData {
  stats: DashboardStats;
  recentDocuments: RecentDocument[];
  recentActions: UpcomingAction[];
  upcomingActions: UpcomingAction[];
  activity: RecentActivity[];
  overdueActions: UpcomingAction[];
}

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfToday = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const OPEN_STATUSES: ActionStatus[] = ['TODO', 'IN_PROGRESS'];

function mapAction(doc: Record<string, unknown>): UpcomingAction {
  const assignee = doc.assigneeId as { _id: Types.ObjectId; name: string } | null;
  return {
    id: String(doc._id),
    title: doc.title as string,
    status: doc.status as ActionStatus,
    priority: doc.priority as ActionPriority,
    dueDate: (doc.dueDate as Date) ?? null,
    assigneeName: assignee?.name ?? null,
    aiGenerated: Boolean(doc.aiGenerated),
  };
}

/**
 * Build the dashboard entirely from MongoDB. Every counter is a real query
 * scoped to the caller's organization - nothing is hardcoded or sampled.
 *
 * Queries are issued in parallel; each one is either indexed
 * (organizationId + status / dueDate) or a bounded count.
 */
export async function getDashboardData(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  recentLimit?: number;
}): Promise<DashboardData> {
  await connectToDatabase();

  const { organizationId } = params;
  const limit = params.recentLimit ?? 5;
  const today = startOfToday();
  const endToday = endOfToday();

  const docBase = { organizationId, deletedAt: null };
  const actionBase = { organizationId, deletedAt: null };

  const [
    documentTotal,
    documentProcessing,
    documentReview,
    documentFailed,
    actionTotal,
    actionTodo,
    actionInProgress,
    actionCompleted,
    actionOverdue,
    actionUpcoming,
    extractionsLast7Days,
    suggestionsAwaitingReview,
    suggestionsApproved,
    suggestionsRejected,
    recentDocuments,
    recentActions,
    upcomingActions,
    overdueActions,
    activity,
  ] = await Promise.all([
    Document.countDocuments(docBase),
    Document.countDocuments({ ...docBase, status: { $in: ['UPLOADED', 'PROCESSING', 'EXTRACTED', 'ANALYZING'] } }),
    Document.countDocuments({ ...docBase, status: 'REVIEW' }),
    Document.countDocuments({ ...docBase, status: 'FAILED' }),

    Action.countDocuments(actionBase),
    Action.countDocuments({ ...actionBase, status: 'TODO' }),
    Action.countDocuments({ ...actionBase, status: 'IN_PROGRESS' }),
    Action.countDocuments({ ...actionBase, status: 'COMPLETED' }),
    Action.countDocuments({
      ...actionBase,
      status: { $in: OPEN_STATUSES },
      dueDate: { $lt: today, $ne: null },
    }),
    Action.countDocuments({
      ...actionBase,
      status: { $in: OPEN_STATUSES },
      dueDate: { $gt: endToday },
    }),

    DocumentExtraction.countDocuments({
      organizationId,
      status: 'COMPLETED',
      createdAt: { $gte: daysAgo(7) },
    }),
    DocumentExtraction.aggregate<{ count: number }>([
      { $match: { organizationId, status: 'COMPLETED' } },
      { $unwind: '$actions' },
      { $match: { 'actions.status': 'PENDING' } },
      { $count: 'count' },
    ]),
    DocumentExtraction.aggregate<{ count: number }>([
      { $match: { organizationId, status: 'COMPLETED' } },
      { $unwind: '$actions' },
      { $match: { 'actions.status': 'APPROVED' } },
      { $count: 'count' },
    ]),
    DocumentExtraction.aggregate<{ count: number }>([
      { $match: { organizationId, status: 'COMPLETED' } },
      { $unwind: '$actions' },
      { $match: { 'actions.status': 'REJECTED' } },
      { $count: 'count' },
    ]),

    Document.find(docBase)
      .select('displayName sourceType status createdAt metadata.pageCount metadata.wordCount')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),

    Action.find(actionBase)
      .select('title status priority dueDate assigneeId aiGenerated')
      .populate('assigneeId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),

    Action.find({ ...actionBase, status: { $in: OPEN_STATUSES }, dueDate: { $ne: null } })
      .select('title status priority dueDate assigneeId aiGenerated')
      .populate('assigneeId', 'name')
      .sort({ dueDate: 1 })
      .limit(limit)
      .lean(),

    Action.find({ ...actionBase, status: { $in: OPEN_STATUSES }, dueDate: { $lt: today } })
      .select('title status priority dueDate assigneeId aiGenerated')
      .populate('assigneeId', 'name')
      .sort({ dueDate: 1 })
      .limit(limit)
      .lean(),

    AuditLog.find({ organizationId })
      .select('action actorName entityType entityId timestamp metadata')
      .sort({ timestamp: -1 })
      .limit(limit + 3)
      .lean(),
  ]);

  const awaiting = suggestionsAwaitingReview[0]?.count ?? 0;
  const approved = suggestionsApproved[0]?.count ?? 0;
  const rejected = suggestionsRejected[0]?.count ?? 0;
  const reviewed = approved + rejected;

  return {
    stats: {
      documents: {
        total: documentTotal,
        processing: documentProcessing,
        review: documentReview,
        failed: documentFailed,
      },
      actions: {
        total: actionTotal,
        pending: actionTodo,
        inProgress: actionInProgress,
        completed: actionCompleted,
        overdue: actionOverdue,
        upcoming: actionUpcoming,
      },
      ai: {
        extractionsLast7Days,
        suggestionsAwaitingReview: awaiting,
        suggestionsApproved: approved,
        suggestionsRejected: rejected,
        // Null rather than 0 so the UI can say "no reviews yet".
        approvalRate: reviewed > 0 ? approved / reviewed : null,
      },
    },
    recentDocuments: recentDocuments.map((doc) => ({
      id: String(doc._id),
      displayName: doc.displayName,
      sourceType: doc.sourceType as string,
      status: doc.status as DocumentStatus,
      createdAt: doc.createdAt,
      pageCount: doc.metadata?.pageCount ?? null,
      wordCount: doc.metadata?.wordCount ?? null,
    })),
    recentActions: recentActions.map((doc) => mapAction(doc as unknown as Record<string, unknown>)),
    upcomingActions: upcomingActions.map((doc) => mapAction(doc as unknown as Record<string, unknown>)),
    overdueActions: overdueActions.map((doc) => mapAction(doc as unknown as Record<string, unknown>)),
    activity: activity.map((entry) => ({
      id: String(entry._id),
      action: entry.action as string,
      actorName: (entry.actorName as string) ?? null,
      entityType: entry.entityType as string,
      entityId: entry.entityId ? String(entry.entityId) : null,
      timestamp: entry.timestamp as Date,
      metadata: (entry.metadata as Record<string, unknown>) ?? {},
    })),
  };
}

/** Actions with due dates, used by the calendar view. */
export async function getCalendarActions(params: {
  organizationId: Types.ObjectId;
  from: Date;
  to: Date;
  assigneeId?: string;
  projectId?: string;
  status?: ActionStatus;
}): Promise<UpcomingAction[]> {
  await connectToDatabase();

  const filter: Record<string, unknown> = {
    organizationId: params.organizationId,
    deletedAt: null,
    dueDate: { $gte: params.from, $lte: params.to },
  };
  if (params.assigneeId) filter.assigneeId = new Types.ObjectId(params.assigneeId);
  if (params.projectId) filter.projectId = new Types.ObjectId(params.projectId);
  if (params.status) filter.status = params.status;

  const docs = await Action.find(filter)
    .select('title status priority dueDate assigneeId aiGenerated')
    .populate('assigneeId', 'name')
    .sort({ dueDate: 1 })
    .limit(500)
    .lean();

  return docs.map((doc) => mapAction(doc as unknown as Record<string, unknown>));
}

/** Aggregated counts per day for the calendar month grid. */
export async function getCalendarDayCounts(params: {
  organizationId: Types.ObjectId;
  from: Date;
  to: Date;
}): Promise<Record<string, number>> {
  await connectToDatabase();

  const rows = await Action.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        organizationId: params.organizationId,
        deletedAt: null,
        status: { $in: OPEN_STATUSES },
        dueDate: { $gte: params.from, $lte: params.to },
      },
    },
    {
      // Grouping in the database avoids shipping every action to the server
      // just to count them per day.
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$dueDate' } },
        count: { $sum: 1 },
      },
    },
  ]);

  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}