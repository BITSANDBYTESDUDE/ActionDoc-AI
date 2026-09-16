import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  createTestOrganization,
  createTestUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../setup/db';
import { Action } from '@/models/Action';
import { Notification } from '@/models/Notification';
import { runDeadlineSweep } from '@/services/reminder.service';

beforeAll(async () => {
  await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

const NOW = new Date('2026-06-15T12:00:00Z');

interface Fixture {
  organizationId: Awaited<ReturnType<typeof createTestOrganization>>['objectId'];
  assigneeId: string;
  otherAssigneeId: string;
}

async function seed(): Promise<Fixture> {
  const owner = await createTestUser({ name: 'Ada Admin' });
  const org = await createTestOrganization({ owner, name: 'Acme Corp' });

  const assignee = await createTestUser({ name: 'Mia Member' });
  await addMember({ organizationId: org.objectId, user: assignee, role: 'MEMBER' });

  const otherAssignee = await createTestUser({ name: 'Omar Member' });
  await addMember({ organizationId: org.objectId, user: otherAssignee, role: 'MEMBER' });

  return {
    organizationId: org.objectId,
    assigneeId: String(assignee.objectId),
    otherAssigneeId: String(otherAssignee.objectId),
  };
}

async function insertAction(params: {
  fixture: Fixture;
  title: string;
  dueDate: Date | null;
  assigneeId?: string | null;
  status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}) {
  return Action.create({
    organizationId: params.fixture.organizationId,
    title: params.title,
    description: '',
    status: params.status ?? 'TODO',
    priority: 'MEDIUM',
    assigneeId:
      params.assigneeId === null
        ? null
        : params.assigneeId ?? params.fixture.assigneeId,
    dueDate: params.dueDate,
    createdById: params.fixture.assigneeId,
  });
}

describe('deadline reminder sweep', () => {
  it('notifies the assignee about an action that is due soon', async () => {
    const fixture = await seed();
    // Two hours from NOW - inside the 24h window.
    await insertAction({
      fixture,
      title: 'Send the revised budget',
      dueDate: new Date(NOW.getTime() + 2 * 3600 * 1000),
    });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.dueSoon).toBe(1);
    expect(result.overdue).toBe(0);

    const notifications = await Notification.find({ type: 'ACTION_DUE_SOON' }).lean();
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0]!.userId)).toBe(fixture.assigneeId);
    expect(notifications[0]!.message).toContain('Send the revised budget');
  });

  it('notifies the assignee about an overdue action', async () => {
    const fixture = await seed();
    await insertAction({
      fixture,
      title: 'Chase the invoice',
      dueDate: new Date(NOW.getTime() - 48 * 3600 * 1000),
    });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.overdue).toBe(1);
    expect(result.dueSoon).toBe(0);

    const notifications = await Notification.find({ type: 'ACTION_OVERDUE' }).lean();
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0]!.userId)).toBe(fixture.assigneeId);
  });

  it('never notifies twice for the same deadline', async () => {
    const fixture = await seed();
    await insertAction({
      fixture,
      title: 'Send the revised budget',
      dueDate: new Date(NOW.getTime() + 2 * 3600 * 1000),
    });

    await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });
    await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });
    await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(await Notification.countDocuments({ type: 'ACTION_DUE_SOON' })).toBe(1);
  });

  it('notifies again when the deadline is rescheduled', async () => {
    const fixture = await seed();
    const action = await insertAction({
      fixture,
      title: 'Send the revised budget',
      dueDate: new Date(NOW.getTime() + 2 * 3600 * 1000),
    });

    await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    await Action.updateOne(
      { _id: action._id },
      { $set: { dueDate: new Date(NOW.getTime() + 5 * 3600 * 1000) } },
    );
    await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(await Notification.countDocuments({ type: 'ACTION_DUE_SOON' })).toBe(2);
  });

  it('ignores completed and cancelled actions', async () => {
    const fixture = await seed();
    await insertAction({
      fixture,
      title: 'Already done',
      dueDate: new Date(NOW.getTime() - 3600 * 1000),
      status: 'COMPLETED',
    });
    await insertAction({
      fixture,
      title: 'Dropped',
      dueDate: new Date(NOW.getTime() - 3600 * 1000),
      status: 'CANCELLED',
    });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.overdue).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('ignores actions with no due date', async () => {
    const fixture = await seed();
    await insertAction({ fixture, title: 'Someday', dueDate: null });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.overdue).toBe(0);
    expect(result.dueSoon).toBe(0);
  });

  it('has nobody to notify for an unassigned action', async () => {
    const fixture = await seed();
    await insertAction({
      fixture,
      title: 'Unowned work',
      dueDate: new Date(NOW.getTime() - 3600 * 1000),
      assigneeId: null,
    });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.overdue).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('does not notify about actions outside the 24 hour window', async () => {
    const fixture = await seed();
    await insertAction({
      fixture,
      title: 'Next week',
      dueDate: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000),
    });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.dueSoon).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('keeps notifications organization-scoped', async () => {
    const fixture = await seed();
    const otherOwner = await createTestUser({ name: 'Olive Outsider' });
    const otherOrg = await createTestOrganization({ owner: otherOwner, name: 'Globex' });

    await insertAction({
      fixture,
      title: 'Acme overdue item',
      dueDate: new Date(NOW.getTime() - 3600 * 1000),
    });

    // Sweeping Globex must not reach into Acme's actions.
    const otherResult = await runDeadlineSweep({
      now: NOW,
      organizationId: otherOrg.objectId,
    });
    expect(otherResult.overdue).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);

    // Sweeping Acme notifies only Acme, and the notification carries Acme's id.
    const acmeResult = await runDeadlineSweep({
      now: NOW,
      organizationId: fixture.organizationId,
    });
    expect(acmeResult.overdue).toBe(1);

    const notifications = await Notification.find({}).lean();
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0]!.organizationId)).toBe(String(fixture.organizationId));
    expect(String(notifications[0]!.organizationId)).not.toBe(String(otherOrg.objectId));
  });

  it('treats an action due exactly now as overdue, not due soon', async () => {
    const fixture = await seed();
    await insertAction({ fixture, title: 'Due right now', dueDate: NOW });

    const result = await runDeadlineSweep({ now: NOW, organizationId: fixture.organizationId });

    expect(result.overdue).toBe(1);
    expect(result.dueSoon).toBe(0);
  });
});