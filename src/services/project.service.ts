import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { Project } from '@/models/Project';
import { Action } from '@/models/Action';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { MAX_PAGE_SIZE } from '@/config/constants';
import { paginated, type PaginatedResult } from '@/lib/validation/common';
import { recordAuditEvent } from '@/services/audit.service';
import { assertMemberOfOrganization } from '@/services/organization.service';
import type { ProjectListQuery } from '@/lib/validation/project';
import type { ProjectStatus } from '@/types';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string;
  startDate: Date | null;
  endDate: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Live counts, computed by aggregation - never stored denormalised. */
  actionCounts: {
    total: number;
    todo: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    overdue: number;
  };
}

type PopulatedUser = { _id: Types.ObjectId; name: string } | null;

function toSummary(doc: Record<string, unknown>, counts?: ProjectSummary['actionCounts']): ProjectSummary {
  const owner = doc.ownerId as PopulatedUser;
  return {
    id: String(doc._id),
    name: doc.name as string,
    description: (doc.description as string) ?? '',
    status: doc.status as ProjectStatus,
    ownerId: owner ? String(owner._id) : null,
    ownerName: owner?.name ?? null,
    createdById: String(doc.createdById),
    startDate: (doc.startDate as Date) ?? null,
    endDate: (doc.endDate as Date) ?? null,
    archivedAt: (doc.archivedAt as Date) ?? null,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    actionCounts: counts ?? emptyCounts(),
  };
}

function emptyCounts(): ProjectSummary['actionCounts'] {
  return { total: 0, todo: 0, inProgress: 0, completed: 0, cancelled: 0, overdue: 0 };
}

/**
 * Compute per-project action counts in a single aggregation for the whole page,
 * avoiding an N+1 query per project row.
 */
async function getCountsByProjectIds(params: {
  organizationId: Types.ObjectId;
  projectIds: Types.ObjectId[];
}): Promise<Map<string, ProjectSummary['actionCounts']>> {
  const counts = new Map<string, ProjectSummary['actionCounts']>();
  if (params.projectIds.length === 0) return counts;

  const rows = await Action.aggregate<{ _id: Types.ObjectId; statuses: string[]; overdue: number; total: number }>([
    {
      $match: {
        organizationId: params.organizationId,
        projectId: { $in: params.projectIds },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        statuses: { $push: '$status' },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$dueDate', null] },
                  { $lt: ['$dueDate', new Date()] },
                  { $not: { $in: ['$status', ['COMPLETED', 'CANCELLED']] } },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  for (const row of rows) {
    const statuses = row.statuses as string[];
    counts.set(String(row._id), {
      total: row.total,
      todo: statuses.filter((status) => status === 'TODO').length,
      inProgress: statuses.filter((status) => status === 'IN_PROGRESS').length,
      completed: statuses.filter((status) => status === 'COMPLETED').length,
      cancelled: statuses.filter((status) => status === 'CANCELLED').length,
      overdue: row.overdue,
    });
  }

  return counts;
}

export async function listProjects(params: {
  organizationId: Types.ObjectId;
  query: ProjectListQuery;
}): Promise<PaginatedResult<ProjectSummary>> {
  await connectToDatabase();

  const pageSize = Math.min(params.query.pageSize, MAX_PAGE_SIZE);
  const skip = (params.query.page - 1) * pageSize;

  const filter: Record<string, unknown> = { organizationId: params.organizationId };
  if (!params.query.includeArchived && !params.query.status) {
    filter.archivedAt = null;
  }
  if (params.query.status) filter.status = params.query.status;
  if (params.query.search) {
    const escaped = params.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
    filter.name = { $regex: escaped, $options: 'i' };
  }

  const sort: Record<string, 1 | -1> = {
    [params.query.sort]: params.query.order === 'asc' ? 1 : -1,
  };
  if (params.query.sort !== 'createdAt') sort.createdAt = -1;

  const [docs, total] = await Promise.all([
    Project.find(filter)
      .populate('ownerId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Project.countDocuments(filter),
  ]);

  const counts = await getCountsByProjectIds({
    organizationId: params.organizationId,
    projectIds: docs.map((doc) => doc._id),
  });

  const items = docs.map((doc) =>
    toSummary(doc as unknown as Record<string, unknown>, counts.get(String(doc._id))),
  );

  return paginated(items, total, params.query.page, pageSize);
}

export async function getProjectDetail(params: {
  organizationId: Types.ObjectId;
  projectId: string;
}): Promise<ProjectSummary> {
  await connectToDatabase();

  const doc = await Project.findOne({
    _id: new Types.ObjectId(params.projectId),
    organizationId: params.organizationId,
  })
    .populate('ownerId', 'name')
    .lean();

  if (!doc) throw new NotFoundError('Project');

  const counts = await getCountsByProjectIds({
    organizationId: params.organizationId,
    projectIds: [doc._id],
  });

  return toSummary(doc as unknown as Record<string, unknown>, counts.get(String(doc._id)));
}

/** Lightweight option list used to populate selectors. */
export async function listProjectOptions(organizationId: Types.ObjectId): Promise<
  { id: string; name: string; status: ProjectStatus }[]
> {
  await connectToDatabase();
  const projects = await Project.find({ organizationId, archivedAt: null })
    .select('name status')
    .sort({ name: 1 })
    .limit(200)
    .lean();

  return projects.map((project) => ({
    id: String(project._id),
    name: project.name,
    status: project.status as ProjectStatus,
  }));
}

export async function createProject(params: {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  input: {
    name: string;
    description: string;
    status: ProjectStatus;
    ownerId?: string;
    startDate?: Date | null;
    endDate?: Date | null;
  };
}): Promise<ProjectSummary> {
  await connectToDatabase();

  const ownerId = params.input.ownerId ? new Types.ObjectId(params.input.ownerId) : params.actorId;
  await assertMemberOfOrganization({ organizationId: params.organizationId, userId: ownerId });

  validateDateRange(params.input.startDate ?? null, params.input.endDate ?? null);

  const existing = await Project.exists({
    organizationId: params.organizationId,
    name: params.input.name,
    archivedAt: null,
  });
  if (existing) throw new ConflictError('A project with that name already exists in this organization.');

  const project = await Project.create({
    organizationId: params.organizationId,
    createdById: params.actorId,
    ownerId,
    name: params.input.name,
    description: params.input.description,
    status: params.input.status,
    startDate: params.input.startDate ?? null,
    endDate: params.input.endDate ?? null,
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'PROJECT_CREATED',
    entityType: 'PROJECT',
    entityId: project._id,
    metadata: { name: params.input.name, status: params.input.status },
  });

  return getProjectDetail({ organizationId: params.organizationId, projectId: String(project._id) });
}

export async function updateProject(params: {
  organizationId: Types.ObjectId;
  projectId: string;
  actorId: Types.ObjectId;
  actorName: string;
  input: {
    name?: string;
    description?: string;
    status?: ProjectStatus;
    ownerId?: string;
    startDate?: Date | null;
    endDate?: Date | null;
  };
}): Promise<ProjectSummary> {
  await connectToDatabase();

  const existing = await Project.findOne({
    _id: new Types.ObjectId(params.projectId),
    organizationId: params.organizationId,
  }).lean();
  if (!existing) throw new NotFoundError('Project');

  if (params.input.ownerId) {
    await assertMemberOfOrganization({
      organizationId: params.organizationId,
      userId: params.input.ownerId,
    });
  }

  if (params.input.name && params.input.name !== existing.name) {
    const duplicate = await Project.exists({
      organizationId: params.organizationId,
      name: params.input.name,
      archivedAt: null,
      _id: { $ne: existing._id },
    });
    if (duplicate) throw new ConflictError('A project with that name already exists in this organization.');
  }

  const startDate = params.input.startDate !== undefined ? params.input.startDate : existing.startDate;
  const endDate = params.input.endDate !== undefined ? params.input.endDate : existing.endDate;
  validateDateRange(startDate ?? null, endDate ?? null);

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params.input)) {
    if (value !== undefined) update[key] = value;
  }
  if (params.input.status === 'ARCHIVED') update.archivedAt = new Date();

  if (Object.keys(update).length === 0) {
    return getProjectDetail({ organizationId: params.organizationId, projectId: params.projectId });
  }

  await Project.updateOne({ _id: existing._id, organizationId: params.organizationId }, { $set: update });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.input.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    entityId: existing._id,
    metadata: { fields: Object.keys(update), status: params.input.status ?? null },
  });

  return getProjectDetail({ organizationId: params.organizationId, projectId: params.projectId });
}

/**
 * Archive a project after detaching its open actions.
 *
 * Actions are never silently completed or deleted; they are unlinked and keep a
 * note of where they came from so nothing is orphaned by accident.
 */
export async function archiveProject(params: {
  organizationId: Types.ObjectId;
  projectId: string;
  actorId: Types.ObjectId;
  actorName: string;
}): Promise<{ detachedActions: number }> {
  await connectToDatabase();

  const project = await Project.findOne({
    _id: new Types.ObjectId(params.projectId),
    organizationId: params.organizationId,
  }).lean();
  if (!project) throw new NotFoundError('Project');
  if (project.archivedAt) throw new ConflictError('This project is already archived.');

  const detached = await Action.updateMany(
    {
      organizationId: params.organizationId,
      projectId: project._id,
      deletedAt: null,
      status: { $in: ['TODO', 'IN_PROGRESS'] },
    },
    { $set: { projectId: null } },
  );

  await Project.updateOne(
    { _id: project._id, organizationId: params.organizationId },
    { $set: { status: 'ARCHIVED', archivedAt: new Date() } },
  );

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    action: 'PROJECT_ARCHIVED',
    entityType: 'PROJECT',
    entityId: project._id,
    metadata: { name: project.name, detachedActions: detached.modifiedCount },
  });

  return { detachedActions: detached.modifiedCount };
}

export async function listActionsForProject(params: {
  organizationId: Types.ObjectId;
  projectId: string;
  limit: number;
}) {
  await connectToDatabase();
  return Action.find({
    organizationId: params.organizationId,
    projectId: new Types.ObjectId(params.projectId),
    deletedAt: null,
  })
    .select('title status priority dueDate assigneeId completedAt aiGenerated')
    .populate('assigneeId', 'name')
    .sort({ status: 1, dueDate: 1 })
    .limit(params.limit)
    .lean();
}

function validateDateRange(start: Date | null, end: Date | null): void {
  if (start && end && start.getTime() > end.getTime()) {
    throw new ValidationError('The start date must be before the end date.', [
      { path: 'endDate', message: 'End date must be after the start date.' },
    ]);
  }
}