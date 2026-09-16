import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  createTestOrganization,
  createTestUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
  type TestOrganization,
  type TestUser,
} from '../setup/db';
import { Action } from '@/models/Action';
import { AuditLog } from '@/models/AuditLog';
import { Notification } from '@/models/Notification';
import { bulkUpdateActions, createAction } from '@/services/action.service';

beforeAll(async () => {
  await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

interface Fixture {
  org: TestOrganization;
  admin: TestUser;
  member: TestUser;
  viewer: TestUser;
  outsider: TestUser;
  otherOrg: TestOrganization;
  actionIds: string[];
}

async function seed(count = 3): Promise<Fixture> {
  const admin = await createTestUser({ name: 'Ada Admin' });
  const org = await createTestOrganization({ owner: admin, name: 'Acme Corp' });

  const member = await createTestUser({ name: 'Mia Member' });
  await addMember({ organizationId: org.objectId, user: member, role: 'MEMBER' });

  const viewer = await createTestUser({ name: 'Vic Viewer' });
  await addMember({ organizationId: org.objectId, user: viewer, role: 'VIEWER' });

  const outsider = await createTestUser({ name: 'Olive Outsider' });
  const otherOrg = await createTestOrganization({ owner: outsider, name: 'Globex' });

  const actionIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const action = await createAction({
      organizationId: org.objectId,
      actorId: admin.objectId,
      actorName: admin.name,
      input: {
        title: `Bulk task ${index + 1}`,
        description: '',
        priority: 'MEDIUM',
        actionType: 'TASK',
      },
    });
    actionIds.push(action.id);
  }

  return { org, admin, member, viewer, outsider, otherOrg, actionIds };
}

describe('bulk operations', () => {
  it('applies one status change to many actions', async () => {
    const f = await seed(3);

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'status',
      status: 'IN_PROGRESS',
    });

    expect(result).toEqual({ requested: 3, succeeded: 3, failed: [] });

    const updated = await Action.find({ organizationId: f.org.objectId }).lean();
    expect(updated).toHaveLength(3);
    expect(updated.every((action) => action.status === 'IN_PROGRESS')).toBe(true);
  });

  it('assigns many actions and notifies each new assignee once', async () => {
    const f = await seed(2);

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'assign',
      assigneeId: f.member.id,
    });

    expect(result.succeeded).toBe(2);

    const updated = await Action.find({ organizationId: f.org.objectId }).lean();
    expect(updated.every((action) => String(action.assigneeId) === f.member.id)).toBe(true);

    const notifications = await Notification.find({ type: 'ACTION_ASSIGNED' }).lean();
    expect(notifications).toHaveLength(2);
    expect(notifications.every((item) => String(item.userId) === f.member.id)).toBe(true);
  });

  it('changes priority across a selection', async () => {
    const f = await seed(2);

    await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'priority',
      priority: 'URGENT',
    });

    const updated = await Action.find({ organizationId: f.org.objectId }).lean();
    expect(updated.every((action) => action.priority === 'URGENT')).toBe(true);
  });

  it('soft-deletes every selected action', async () => {
    const f = await seed(2);

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'delete',
    });

    expect(result.succeeded).toBe(2);
    expect(await Action.countDocuments({ organizationId: f.org.objectId, deletedAt: null })).toBe(0);
  });

  it('skips only invalid transitions and still applies the rest', async () => {
    const f = await seed(2);
    // COMPLETED -> IN_PROGRESS is not an allowed transition.
    await Action.updateOne({ _id: f.actionIds[0] }, { $set: { status: 'COMPLETED' } });

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'status',
      status: 'IN_PROGRESS',
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.actionId).toBe(f.actionIds[0]);
    expect(result.failed[0]!.reason).toMatch(/Cannot move an action/i);

    // The valid one really changed.
    const ok = await Action.findById(f.actionIds[1]).lean();
    expect(ok?.status).toBe('IN_PROGRESS');
  });

  it('reports a foreign action id as failed rather than touching it', async () => {
    const f = await seed(1);
    const foreign = await createAction({
      organizationId: f.otherOrg.objectId,
      actorId: f.outsider.objectId,
      actorName: f.outsider.name,
      input: { title: 'Globex task', description: '', priority: 'LOW', actionType: 'TASK' },
    });

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: [f.actionIds[0]!, foreign.id],
      operation: 'priority',
      priority: 'URGENT',
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.actionId).toBe(foreign.id);

    // The other organization's action is untouched.
    const untouched = await Action.findById(foreign.id).lean();
    expect(untouched?.priority).toBe('LOW');
  });

  it('refuses every operation for a viewer', async () => {
    const f = await seed(2);

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.viewer.objectId,
      actorName: f.viewer.name,
      role: 'VIEWER',
      actionIds: f.actionIds,
      operation: 'delete',
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toHaveLength(2);
    expect(await Action.countDocuments({ organizationId: f.org.objectId, deletedAt: null })).toBe(2);
  });

  it('does not assign across organization boundaries', async () => {
    const f = await seed(1);

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'assign',
      assigneeId: f.outsider.id,
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toHaveLength(1);

    const action = await Action.findById(f.actionIds[0]).lean();
    expect(action?.assigneeId).toBeNull();
  });

  it('can unassign a selection', async () => {
    const f = await seed(2);
    await Action.updateMany(
      { organizationId: f.org.objectId },
      { $set: { assigneeId: f.member.objectId } },
    );

    const result = await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'assign',
      assigneeId: null,
    });

    expect(result.succeeded).toBe(2);
    const updated = await Action.find({ organizationId: f.org.objectId }).lean();
    expect(updated.every((action) => action.assigneeId === null)).toBe(true);
  });

  it('writes one summary audit event with the outcome counts', async () => {
    const f = await seed(2);
    await Action.updateOne({ _id: f.actionIds[0] }, { $set: { status: 'COMPLETED' } });

    await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'status',
      status: 'IN_PROGRESS',
    });

    const events = await AuditLog.find({ action: 'ACTIONS_BULK_STATUS' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(String(events[0]!.organizationId)).toBe(String(f.org.objectId));
  });

  it('surfaces an unexpected failure instead of hiding it as a skipped item', async () => {
    const f = await seed(1);

    // A malformed id is a programming error, not a per-item outcome: the
    // service must let it escape rather than quietly report "0 succeeded".
    await expect(
      bulkUpdateActions({
        organizationId: f.org.objectId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        role: 'ADMIN',
        actionIds: ['not-an-object-id'],
        operation: 'priority',
        priority: 'HIGH',
      }),
    ).rejects.toThrow();
  });

  it('keeps the audit trail append-only across bulk writes', async () => {
    const f = await seed(1);

    await bulkUpdateActions({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'ADMIN',
      actionIds: f.actionIds,
      operation: 'priority',
      priority: 'LOW',
    });

    const event = await AuditLog.findOne({ action: 'ACTIONS_BULK_PRIORITY' }).lean();
    expect(event).toBeTruthy();

    await expect(
      AuditLog.updateOne({ _id: event!._id }, { $set: { action: 'ACTION_UPDATED' } }),
    ).rejects.toThrow(/append-only/i);
  });
});