import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { withTransaction } from '@/lib/db/transaction';
import { Action } from '@/models/Action';
import { Document } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { Project } from '@/models/Project';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { MAX_PAGE_SIZE } from '@/config/constants';
import { paginated, type PaginatedResult } from '@/lib/validation/common';
import { assertTransition, transitionTimestamps } from '@/services/action-transitions';
import { assertMemberOfOrganization } from '@/services/organization.service';
import { recordAuditEvent, type AuditAction } from '@/services/audit.service';
import { createNotification } from '@/services/notification.service';
import type { ActionListQuery } from '@/lib/validation/action';
import type { ActionPriority, ActionStatus, ActionType, UserRole } from '@/types';

export interface ActionSummary {
  id: string;
  title: string;
  description: string;
  status: ActionStatus;
  priority: ActionPriority;
  actionType: ActionType;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string;
  createdByName: string | null;
  projectId: string | null;
  projectName: string | null;
  documentId: string | null;
  sourceDocumentName: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  aiGenerated: boolean;
  aiConfidence: number | null;
  evidence: string | null;
  sourceLocation: string | null;
  createdAt: Date;
  updatedAt: Date;
  isOverdue: boolean;
}

const LIST_PROJECTION = {
  title: 1,
  description: 1,
  status: 1,
  priority: 1,
  actionType: 1,
  assigneeId: 1,
  createdById: 1,
  projectId: 1,
  documentId: 1,
  sourceDocumentName: 1,
  dueDate: 1,
  completedAt: 1,
  aiGenerated: 1,
  aiConfidence: 1,
  evidence: 1,
  sourceLocation: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

type PopulatedUser = { _id: Types.ObjectId; name: string } | null;
type PopulatedProject = { _id: Types.ObjectId; name: string } | null;

function toSummary(doc: Record<string, unknown>): ActionSummary {
  const dueDate = (doc.dueDate as Date | null) ?? null;
  const status = doc.status as ActionStatus;
  const assignee = doc.assigneeId as PopulatedUser;
  const creator = doc.createdById as PopulatedUser;
  const project = doc.projectId as PopulatedProject;

  return {
    id: String(doc._id),
    title: doc.title as string,
    description: (doc.description as string) ?? '',
    status,
    priority: doc.priority as ActionPriority,
    actionType: doc.actionType as ActionType,
    assigneeId: assignee ? String(assignee._id) : null,
    assigneeName: assignee?.name ?? null,
    createdById: creator ? String(creator._id) : String(doc.createdById),
    createdByName: creator?.name ?? null,
    projectId: project ? String(project._id) : null,
    projectName: project?.name ?? null,
    documentId: doc.documentId ? String(doc.documentId) : null,
    sourceDocumentName: (doc.sourceDocumentName as string) ?? null,
    dueDate,
    completedAt: (doc.completedAt as Date) ?? null,
    aiGenerated: Boolean(doc.aiGenerated),
    aiConfidence: (doc.aiConfidence as number) ?? null,
    evidence: (doc.evidence as string) ?? null,
    sourceLocation: (doc.sourceLocation as string) ?? null,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    isOverdue: Boolean(
      dueDate && status !== 'COMPLETED' && status !== 'CANCELLED' && dueDate.getTime() < Date.now(),
    ),
  };
}

function startOfToday(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfToday(now = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Build the MongoDB filter for a list request.
 *
 * Every branch starts from `organizationId`, so a filter can never widen the
 * query beyond the caller's tenant.
 */
export function buildActionFilter(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  query: ActionListQuery;
}): Record<string, unknown> {
  const { organizationId, userId, query } = params;

  const filter: Record<string, unknown> = { organizationId, deletedAt: null };

  // View-specific constraints come first; explicit filters refine them.
  switch (query.view) {
    case 'mine':
      filter.assigneeId = userId;
      break;
    case 'today':
      filter.dueDate = { $gte: startOfToday(), $lte: endOfToday() };
      filter.status = { $nin: ['COMPLETED', 'CANCELLED'] };
      break;
    case 'upcoming':
      filter.dueDate = { $gt: endOfToday() };
      filter.status = { $nin: ['COMPLETED', 'CANCELLED'] };
      break;
    case 'overdue':
      filter.dueDate = { $lt: startOfToday() };
      filter.status = { $nin: ['COMPLETED', 'CANCELLED'] };
      break;
    case 'completed':
      filter.status = 'COMPLETED';
      break;
    case 'all':
    default:
      break;
  }

  if (query.status && filter.status === undefined) filter.status = query.status;
  else if (query.status && typeof filter.status === 'object') {
    // An explicit status filter overrides the view's status constraint.
    filter.status = query.status;
  }

  if (query.priority) filter.priority = query.priority;

  if (query.assigneeId) {
    filter.assigneeId = query.assigneeId === 'unassigned' ? null : new Types.ObjectId(query.assigneeId);
  }

  if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
  if (query.aiGenerated !== undefined) filter.aiGenerated = query.aiGenerated;

  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.$gte = query.dateFrom;
    if (query.dateTo) range.$lte = query.dateTo;
    // Date-range filters apply to the due date, which is what users reason about.
    filter.dueDate = { ...(filter.dueDate as Record<string, unknown> | undefined), ...range };
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
    filter.title = { $regex: escaped, $options: 'i' };
  }

  return filter;
}

export async function listActions(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  query: ActionListQuery;
}): Promise<PaginatedResult<ActionSummary>> {
  await connectToDatabase();

  const pageSize = Math.min(params.query.pageSize, MAX_PAGE_SIZE);
  const skip = (params.query.page - 1) * pageSize;
  const filter = buildActionFilter(params);

  const sort: Record<string, 1 | -1> = {
    [params.query.sort]: params.query.order === 'asc' ? 1 : -1,
  };
  // Secondary sort keeps pagination stable when the primary key ties.
  if (params.query.sort !== 'createdAt') sort.createdAt = -1;

  const [docs, total] = await Promise.all([
    Action.find(filter)
      .select(LIST_PROJECTION)
      .populate('assigneeId', 'name')
      .populate('createdById', 'name')
      .populate('projectId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Action.countDocuments(filter),
  ]);

  return paginated(
    docs.map((doc) => toSummary(doc as unknown as Record<string, unknown>)),
    total,
    params.query.page,
    pageSize,
  );
}

/** Action counts per view, computed in a single aggregation pass. */
export async function getActionViewCounts(params: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
}): Promise<{ all: number; mine: number; today: number; upcoming: number; overdue: number; completed: number }> {
  await connectToDatabase();
  const base = { organizationId: params.organizationId, deletedAt: null };
  const open = { $nin: ['COMPLETED', 'CANCELLED'] as ActionStatus[] };
  const now = new Date();

  const [all, mine, today, upcoming, overdue, completed] = await Promise.all([
    Action.countDocuments(base),
    Action.countDocuments({ ...base, assigneeId: params.userId, status: { $in: ['TODO', 'IN_PROGRESS'] } }),
    Action.countDocuments({ ...base, dueDate: { $gte: startOfToday(now), $lte: endOfToday(now) }, status: open }),
    Action.countDocuments({ ...base, dueDate: { $gt: endOfToday(now) }, status: open }),
    Action.countDocuments({ ...base, dueDate: { $lt: startOfToday(now) }, status: open }),
    Action.countDocuments({ ...base, status: 'COMPLETED' }),
  ]);

  return { all, mine, today, upcoming, overdue, completed };
}

export async function getActionDetail(params: {
  organizationId: Types.ObjectId;
  actionId: string;
}): Promise<ActionSummary> {
  await connectToDatabase();

  const doc = await Action.findOne({
    _id: new Types.ObjectId(params.actionId),
    organizationId: params.organizationId,
    deletedAt: null,
  })
    .populate('assigneeId', 'name')
    .populate('createdById', 'name')
    .populate('projectId', 'name')
    .lean();

  if (!doc) throw new NotFoundError('Action');
  return toSummary(doc as unknown as Record<string, unknown>);
}

export async function listActionsForDocument(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<ActionSummary[]> {
  await connectToDatabase();
  const docs = await Action.find({
    organizationId: params.organizationId,
    documentId: new Types.ObjectId(params.documentId),
    deletedAt: null,
  })
    .select(LIST_PROJECTION)
    .populate('assigneeId', 'name')
    .populate('createdById', 'name')
    .populate('projectId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return docs.map((doc) => toSummary(doc as unknown as Record<string, unknown>));
}

/**
 * Create an action created directly by a user (not from an AI suggestion).
 */
export async function createAction(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  input: {
    title: string;
    description: string;
    priority: ActionPriority;
    actionType: ActionType;
    assigneeId?: string | null;
    projectId?: string | null;
    dueDate?: Date | null;
  };
}): Promise<ActionSummary> {
  await connectToDatabase();

  if (params.input.projectId) {
    await assertProjectInOrganization({
      organizationId: params.organizationId,
      projectId: params.input.projectId,
    });
  }
  if (params.input.assigneeId) {
    await assertMemberOfOrganization({
      organizationId: params.organizationId,
      userId: params.input.assigneeId,
    });
  }

  // New actions always start in TODO; the transition service owns the rest.
  const action = await Action.create({
    organizationId: params.organizationId,
    createdById: params.actorId,
    title: params.input.title,
    description: params.input.description,
    priority: params.input.priority,
    actionType: params.input.actionType,
    status: 'TODO',
    assigneeId: params.input.assigneeId ?? null,
    projectId: params.input.projectId ?? null,
    dueDate: params.input.dueDate ?? null,
    aiGenerated: false,
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'ACTION_CREATED',
    entityType: 'ACTION',
    entityId: action._id,
    metadata: { title: params.input.title, assigneeId: params.input.assigneeId ?? null },
  });

  if (params.input.assigneeId) {
    await notifyAssignment({
      organizationId: params.organizationId,
      actionId: action._id,
      actionTitle: params.input.title,
      assigneeId: new Types.ObjectId(params.input.assigneeId),
      actorId: params.actorId,
      actorName: params.actorName,
    });
  }

  return getActionDetail({ organizationId: params.organizationId, actionId: String(action._id) });
}



/**
 * Load an action that the caller is allowed to mutate.
 *
 * OWNER/ADMIN/MEMBER may edit any action in their organization; VIEWER is
 * read-only. The lookup itself is organization-scoped, so this doubles as the
 * cross-tenant guard.
 */
async function assertCanMutateAction(params: {
  organizationId: Types.ObjectId;
  actionId: string;
  role: UserRole;
  operation: string;
}) {
  await connectToDatabase();

  if (params.role === 'VIEWER') {
    throw new ForbiddenError(`You do not have permission to ${params.operation} actions.`);
  }

  const action = await Action.findOne({
    _id: new Types.ObjectId(params.actionId),
    organizationId: params.organizationId,
    deletedAt: null,
  }).lean();

  if (!action) throw new NotFoundError('Action');

  return action;
}

export async function updateAction(params: {
  organizationId: Types.ObjectId;
  actionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  role: UserRole;
  input: {
    title?: string;
    description?: string;
    priority?: ActionPriority;
    actionType?: ActionType;
    assigneeId?: string | null;
    projectId?: string | null;
    dueDate?: Date | null;
  };
}): Promise<ActionSummary> {
  const existing = await assertCanMutateAction({
    organizationId: params.organizationId,
    actionId: params.actionId,
    role: params.role,
    operation: 'edit',
  });

  if (params.input.projectId) {
    await assertProjectInOrganization({
      organizationId: params.organizationId,
      projectId: params.input.projectId,
    });
  }
  if (params.input.assigneeId) {
    await assertMemberOfOrganization({
      organizationId: params.organizationId,
      userId: params.input.assigneeId,
    });
  }

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params.input)) {
    if (value !== undefined) update[key] = value;
  }

  if (Object.keys(update).length === 0) {
    return getActionDetail({ organizationId: params.organizationId, actionId: params.actionId });
  }

  const updated = await Action.findOneAndUpdate(
    { _id: existing._id, organizationId: params.organizationId, deletedAt: null },
    { $set: update },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) throw new NotFoundError('Action');

  const assigneeChanged =
    params.input.assigneeId !== undefined && String(existing.assigneeId ?? '') !== String(params.input.assigneeId ?? '');

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: assigneeChanged ? 'ACTION_ASSIGNED' : 'ACTION_UPDATED',
    entityType: 'ACTION',
    entityId: existing._id,
    metadata: {
      fields: Object.keys(update),
      assigneeId: params.input.assigneeId ?? null,
      priority: params.input.priority ?? null,
    },
  });

  if (assigneeChanged && params.input.assigneeId) {
    await notifyAssignment({
      organizationId: params.organizationId,
      actionId: existing._id,
      actionTitle: updated.title,
      assigneeId: new Types.ObjectId(params.input.assigneeId),
      actorId: params.actorId,
      actorName: params.actorName,
    });
  }

  return getActionDetail({ organizationId: params.organizationId, actionId: params.actionId });
}

export async function changeActionStatus(params: {
  organizationId: Types.ObjectId;
  actionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  role: UserRole;
  status: ActionStatus;
}): Promise<ActionSummary> {
  const existing = await assertCanMutateAction({
    organizationId: params.organizationId,
    actionId: params.actionId,
    role: params.role,
    operation: 'change the status of',
  });

  const from = existing.status as ActionStatus;
  assertTransition(from, params.status);

  // Conditional update guards against two reviewers racing on the same action.
  const updated = await Action.findOneAndUpdate(
    { _id: existing._id, organizationId: params.organizationId, status: from, deletedAt: null },
    { $set: { status: params.status, ...transitionTimestamps(params.status) } },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw new ConflictError('This action was modified by someone else. Reload and try again.');
  }

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'ACTION_STATUS_CHANGED',
    entityType: 'ACTION',
    entityId: existing._id,
    metadata: { from, to: params.status },
  });

  if (params.status === 'COMPLETED' && existing.createdById) {
    const creatorId = new Types.ObjectId(String(existing.createdById));
    if (String(creatorId) !== String(params.actorId)) {
      await createNotification({
        organizationId: params.organizationId,
        userId: creatorId,
        type: 'ACTION_COMPLETED',
        title: 'Action completed',
        message: `${params.actorName} completed "${updated.title}".`,
        relatedEntityType: 'ACTION',
        relatedEntityId: existing._id,
      });
    }
  }

  return getActionDetail({ organizationId: params.organizationId, actionId: params.actionId });
}

/**
 * Bulk operations over a set of actions.
 *
 * Deliberately partial-failure tolerant: each action is processed independently
 * and reported per-item, because a single invalid status transition in a
 * 30-item selection should not throw away the other 29 successful changes.
 * Every id is still resolved through the same organization-scoped authorization
 * helpers, so a foreign id simply reports as failed rather than leaking.
 */
export type BulkOperation = 'status' | 'assign' | 'priority' | 'delete';

/** Explicit map so the audit action stays a known literal, not a built string. */
const BULK_AUDIT_ACTION = {
  status: 'ACTIONS_BULK_STATUS',
  assign: 'ACTIONS_BULK_ASSIGN',
  priority: 'ACTIONS_BULK_PRIORITY',
  delete: 'ACTIONS_BULK_DELETE',
} as const satisfies Record<BulkOperation, AuditAction>;

export interface BulkActionResult {
  requested: number;
  succeeded: number;
  failed: { actionId: string; reason: string }[];
}

export async function bulkUpdateActions(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  role: UserRole;
  actionIds: string[];
  operation: BulkOperation;
  status?: ActionStatus;
  assigneeId?: string | null;
  priority?: ActionPriority;
}): Promise<BulkActionResult> {
  await connectToDatabase();

  const failed: { actionId: string; reason: string }[] = [];
  let succeeded = 0;

  for (const actionId of params.actionIds) {
    try {
      switch (params.operation) {
        case 'status':
          await changeActionStatus({
            organizationId: params.organizationId,
            actionId,
            actorId: params.actorId,
            actorName: params.actorName,
            role: params.role,
            status: params.status!,
          });
          break;
        case 'assign':
          await updateAction({
            organizationId: params.organizationId,
            actionId,
            actorId: params.actorId,
            actorName: params.actorName,
            role: params.role,
            input: { assigneeId: params.assigneeId ?? null },
          });
          break;
        case 'priority':
          await updateAction({
            organizationId: params.organizationId,
            actionId,
            actorId: params.actorId,
            actorName: params.actorName,
            role: params.role,
            input: { priority: params.priority },
          });
          break;
        case 'delete':
          await deleteAction({
            organizationId: params.organizationId,
            actionId,
            actorId: params.actorId,
            actorName: params.actorName,
            role: params.role,
          });
          break;
      }
      succeeded += 1;
    } catch (error) {
      // Expected control-flow errors (not found, forbidden, invalid transition)
      // are surfaced per item. Anything unexpected is rethrown so real faults
      // are not silently swallowed into a "failed" count.
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError ||
        error instanceof ConflictError ||
        // `assertTransition` rejects a status move that the graph disallows;
        // that is a per-item outcome, not a fault in the batch.
        error instanceof ValidationError
      ) {
        failed.push({ actionId, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: BULK_AUDIT_ACTION[params.operation],
    entityType: 'ACTION',
    entityId: null,
    metadata: {
      requested: params.actionIds.length,
      succeeded,
      failed: failed.length,
      status: params.status ?? null,
      assigneeId: params.assigneeId ?? null,
      priority: params.priority ?? null,
    },
  });

  return { requested: params.actionIds.length, succeeded, failed };
}

export async function deleteAction(params: {
  organizationId: Types.ObjectId;
  actionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  role: UserRole;
}): Promise<void> {
  const existing = await assertCanMutateAction({
    organizationId: params.organizationId,
    actionId: params.actionId,
    role: params.role,
    operation: 'delete',
  });

  // Soft delete keeps the audit trail and any provenance intact.
  const result = await Action.updateOne(
    { _id: existing._id, organizationId: params.organizationId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
  if (result.modifiedCount === 0) throw new NotFoundError('Action');

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'ACTION_DELETED',
    entityType: 'ACTION',
    entityId: existing._id,
    metadata: { title: existing.title },
  });
}

/**
 * Approve a pending AI suggestion, creating a real Action.
 *
 * The suggestion status flip and the Action insert happen in one transaction
 * when available, and the conditional update on `actions.$.status: 'PENDING'`
 * prevents double-approval in every case.
 */
export async function approveSuggestion(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  suggestionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  projectId?: string | null;
}): Promise<{ actionId: string; action: ActionSummary }> {
  await connectToDatabase();

  if (params.projectId) {
    await assertProjectInOrganization({
      organizationId: params.organizationId,
      projectId: params.projectId,
    });
  }

  const extraction = await DocumentExtraction.findOne({
    organizationId: params.organizationId,
    documentId: new Types.ObjectId(params.documentId),
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!extraction) throw new NotFoundError('Document extraction');

  const suggestion = extraction.actions.find((item) => item.suggestionId === params.suggestionId);
  if (!suggestion) throw new NotFoundError('AI suggestion');
  if (suggestion.status !== 'PENDING') {
    throw new ConflictError('This suggestion has already been reviewed.');
  }

  // The suggestion may point at a member who has since left the organization.
  let assigneeId: Types.ObjectId | null = suggestion.assigneeId ?? null;
  if (assigneeId) {
    try {
      await assertMemberOfOrganization({ organizationId: params.organizationId, userId: assigneeId });
    } catch {
      assigneeId = null;
    }
  }

  const document = await Document.findOne({
    _id: new Types.ObjectId(params.documentId),
    organizationId: params.organizationId,
  })
    .select('displayName')
    .lean();

  const result = await withTransaction(async (session) => {
    // Conditional claim: only the first caller flips PENDING -> APPROVED.
    const claimed = await DocumentExtraction.findOneAndUpdate(
      {
        _id: extraction._id,
        organizationId: params.organizationId,
        actions: { $elemMatch: { suggestionId: params.suggestionId, status: 'PENDING' } },
      },
      {
        $set: {
          'actions.$.status': 'APPROVED',
          'actions.$.reviewerId': params.actorId,
          'actions.$.reviewedAt': new Date(),
        },
      },
      { returnDocument: 'after', session: session ?? undefined },
    ).lean();

    if (!claimed) {
      throw new ConflictError('This suggestion has already been reviewed.');
    }

    const [action] = await Action.create(
      [
        {
          organizationId: params.organizationId,
          documentId: extraction.documentId,
          extractionId: extraction._id,
          suggestionId: params.suggestionId,
          projectId: params.projectId ?? null,
          title: suggestion.title,
          description: suggestion.description ?? '',
          status: 'TODO',
          priority: suggestion.priority ?? 'MEDIUM',
          actionType: suggestion.actionType ?? 'TASK',
          assigneeId,
          createdById: params.actorId,
          dueDate: suggestion.dueDate ?? null,
          aiGenerated: true,
          aiConfidence: suggestion.confidence ?? null,
          aiModel: extraction.model,
          promptVersion: extraction.promptVersion,
          evidence: suggestion.evidence,
          sourceLocation: suggestion.sourceLocation ?? null,
          sourceDocumentName: document?.displayName ?? null,
        },
      ],
      { session: session ?? undefined },
    );

    if (!action) throw new Error('Failed to create the action.');

    await DocumentExtraction.updateOne(
      { _id: extraction._id },
      { $set: { 'actions.$[target].actionId': action._id } },
      { arrayFilters: [{ 'target.suggestionId': params.suggestionId }], session: session ?? undefined },
    );

    return action;
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'SUGGESTION_APPROVED',
    entityType: 'ACTION',
    entityId: result._id,
    metadata: {
      documentId: params.documentId,
      extractionId: String(extraction._id),
      suggestionId: params.suggestionId,
      aiConfidence: suggestion.confidence ?? null,
    },
  });

  if (assigneeId && String(assigneeId) !== String(params.actorId)) {
    await notifyAssignment({
      organizationId: params.organizationId,
      actionId: result._id,
      actionTitle: suggestion.title,
      assigneeId,
      actorId: params.actorId,
      actorName: params.actorName,
    });
  }

  await refreshDocumentReviewState({
    organizationId: params.organizationId,
    documentId: params.documentId,
  });

  const action = await getActionDetail({ organizationId: params.organizationId, actionId: String(result._id) });
  return { actionId: String(result._id), action };
}

/**
 * Edit a pending AI suggestion.
 *
 * The first human edit snapshots the AI's original values into `original`, so
 * the reviewer can always compare what the model proposed against what they
 * changed. Later edits keep the same snapshot and only update the working copy.
 */
export async function editSuggestion(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  suggestionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  input: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    dueDate?: Date | null;
    priority?: ActionPriority;
  };
}): Promise<void> {
  await connectToDatabase();

  if (params.input.assigneeId) {
    await assertMemberOfOrganization({
      organizationId: params.organizationId,
      userId: params.input.assigneeId,
    });
  }

  const fields: Record<string, unknown> = {};
  if (params.input.title !== undefined) fields.title = params.input.title;
  if (params.input.description !== undefined) fields.description = params.input.description;
  if (params.input.priority !== undefined) fields.priority = params.input.priority;
  if (params.input.dueDate !== undefined) fields.dueDate = params.input.dueDate;
  if (params.input.assigneeId !== undefined) {
    fields.assigneeId = params.input.assigneeId
      ? new Types.ObjectId(params.input.assigneeId)
      : null;
    // A human-chosen assignee supersedes the name the AI guessed.
    if (params.input.assigneeId === null) fields.assigneeName = null;
  }

  // A single pipeline update keeps the snapshot and the edits atomic: `original`
  // is written from the pre-edit values only when it is still null, so repeated
  // edits never overwrite the AI's first proposal with a human's later revision.
  const result = await DocumentExtraction.updateOne(
    {
      organizationId: params.organizationId,
      documentId: new Types.ObjectId(params.documentId),
      actions: { $elemMatch: { suggestionId: params.suggestionId, status: 'PENDING' } },
    },
    [
      {
        $set: {
          actions: {
            $map: {
              input: '$actions',
              as: 'suggestion',
              in: {
                $cond: [
                  { $eq: ['$$suggestion.suggestionId', params.suggestionId] },
                  {
                    $mergeObjects: [
                      '$$suggestion',
                      {
                        original: {
                          $ifNull: [
                            '$$suggestion.original',
                            {
                              title: '$$suggestion.title',
                              description: '$$suggestion.description',
                              assigneeName: '$$suggestion.assigneeName',
                              dueDate: '$$suggestion.dueDate',
                              priority: '$$suggestion.priority',
                            },
                          ],
                        },
                        edited: true,
                        reviewerId: params.actorId,
                        reviewedAt: new Date(),
                      },
                      fields,
                    ],
                  },
                  '$$suggestion',
                ],
              },
            },
          },
        },
      },
    ],
    // Mongoose 9 refuses an array update unless this opt-in is explicit; it is
    // what makes the snapshot-and-edit a single atomic document update.
    { updatePipeline: true },
  );

  if (result.matchedCount === 0) {
    throw new ConflictError('This suggestion is no longer pending and cannot be edited.');
  }
}

/** Reject a pending AI suggestion. No Action is created. */
export async function rejectSuggestion(params: {
  organizationId: Types.ObjectId;
  documentId: string;
  suggestionId: string;
  actorId: Types.ObjectId;
  actorName: string;
  rejectionReason?: string;
}): Promise<void> {
  await connectToDatabase();

  const result = await DocumentExtraction.findOneAndUpdate(
    {
      organizationId: params.organizationId,
      documentId: new Types.ObjectId(params.documentId),
      actions: { $elemMatch: { suggestionId: params.suggestionId, status: 'PENDING' } },
    },
    {
      $set: {
        'actions.$.status': 'REJECTED',
        'actions.$.reviewerId': params.actorId,
        'actions.$.reviewedAt': new Date(),
        'actions.$.rejectionReason': params.rejectionReason ?? null,
      },
    },
    { returnDocument: 'after' },
  ).lean();

  if (!result) {
    throw new ConflictError('This suggestion has already been reviewed.');
  }

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'SUGGESTION_REJECTED',
    entityType: 'EXTRACTION',
    entityId: result._id,
    metadata: {
      documentId: params.documentId,
      suggestionId: params.suggestionId,
      reason: params.rejectionReason ?? null,
    },
  });

  await refreshDocumentReviewState({
    organizationId: params.organizationId,
    documentId: params.documentId,
  });
}

/**
 * Move a document from REVIEW to COMPLETED once every suggestion has been
 * reviewed, so the library reflects real outstanding work.
 */
async function refreshDocumentReviewState(params: {
  organizationId: Types.ObjectId;
  documentId: string;
}): Promise<void> {
  const extraction = await DocumentExtraction.findOne({
    organizationId: params.organizationId,
    documentId: new Types.ObjectId(params.documentId),
  })
    .sort({ createdAt: -1 })
    .select('actions')
    .lean();

  if (!extraction) return;

  const pending = extraction.actions.filter((action) => action.status === 'PENDING').length;
  if (pending > 0) return;

  await Document.updateOne(
    {
      _id: new Types.ObjectId(params.documentId),
      organizationId: params.organizationId,
      status: 'REVIEW',
    },
    { $set: { status: 'COMPLETED' } },
  );
}

export async function assertProjectInOrganization(params: {
  organizationId: Types.ObjectId;
  projectId: string;
}): Promise<void> {
  await connectToDatabase();
  const exists = await Project.exists({
    _id: new Types.ObjectId(params.projectId),
    organizationId: params.organizationId,
    archivedAt: null,
  });
  if (!exists) throw new NotFoundError('Project');
}

/** Create an assignment notification, never notifying the actor themselves. */
async function notifyAssignment(params: {
  organizationId: Types.ObjectId;
  actionId: Types.ObjectId;
  actionTitle: string;
  assigneeId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
}): Promise<void> {
  if (String(params.assigneeId) === String(params.actorId)) return;

  await createNotification({
    organizationId: params.organizationId,
    userId: params.assigneeId,
    type: 'ACTION_ASSIGNED',
    title: 'New action assigned to you',
    message: `${params.actorName} assigned you "${params.actionTitle}".`,
    relatedEntityType: 'ACTION',
    relatedEntityId: params.actionId,
    // No dedupe key: a user should see every assignment, including re-assignment.
    dedupeKey: null,
  });
}

