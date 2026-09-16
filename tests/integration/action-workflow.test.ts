import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
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
import { Document as DocumentModel } from '@/models/Document';
import { DocumentExtraction } from '@/models/DocumentExtraction';
import { Membership } from '@/models/Membership';
import { Notification } from '@/models/Notification';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import {
  approveSuggestion,
  changeActionStatus,
  createAction,
  deleteAction,
  editSuggestion,
  getActionDetail,
  getActionViewCounts,
  listActions,
  rejectSuggestion,
  updateAction,
} from '@/services/action.service';
import { listDocuments } from '@/services/document.service';
import { createProject } from '@/services/project.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

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
  projectId: string;
  documentId: string;
  extractionId: string;
  suggestionId: string;
}

/** Build two isolated tenants with a document, extraction and one suggestion. */
async function seed(): Promise<Fixture> {
  const admin = await createTestUser({ name: 'Ada Admin' });
  const org = await createTestOrganization({ owner: admin, name: 'Acme Corp' });

  const member = await createTestUser({ name: 'Mia Member' });
  await addMember({ organizationId: org.objectId, user: member, role: 'MEMBER' });

  const viewer = await createTestUser({ name: 'Vic Viewer' });
  await addMember({ organizationId: org.objectId, user: viewer, role: 'VIEWER' });

  const outsider = await createTestUser({ name: 'Olive Outsider' });
  const otherOrg = await createTestOrganization({ owner: outsider, name: 'Globex' });

  const project = await createProject({
    organizationId: org.objectId,
    actorId: admin.objectId,
    actorName: admin.name,
    input: { name: 'Q2 Launch', description: 'Launch the new product.', status: 'ACTIVE' },
  });

  const document = await DocumentModel.create({
    organizationId: org.objectId,
    createdById: admin.objectId,
    originalName: 'kickoff.pdf',
    displayName: 'kickoff.pdf',
    mimeType: 'application/pdf',
    sourceType: 'PDF',
    fileSize: 2048,
    storageKey: `documents/${org.id}/2026/04/${new Types.ObjectId().toHexString()}/kickoff.pdf`,
    fileHash: 'a'.repeat(64),
    status: 'REVIEW',
    extractedText: 'Dana will send the revised budget by 18 April.',
    summary: 'Kickoff notes.',
  });

  const suggestionId = 's1-abc123';
  const extraction = await DocumentExtraction.create({
    organizationId: org.objectId,
    documentId: document._id,
    promptVersion: 'extract-actions@1.0.0',
    model: 'gpt-4o-mini',
    status: 'COMPLETED',
    summary: 'Kickoff notes.',
    actions: [
      {
        suggestionId,
        title: 'Send the revised budget',
        description: 'Finance needs the numbers.',
        assigneeName: 'Mia Member',
        assigneeId: member.objectId,
        dueDate: new Date('2026-04-18T00:00:00Z'),
        priority: 'HIGH',
        actionType: 'TASK',
        confidence: 0.84,
        evidence: 'Dana will send the revised budget by 18 April.',
        sourceLocation: 'Page 1',
        status: 'PENDING',
      },
    ],
    createdById: admin.objectId,
  });

  await DocumentModel.updateOne(
    { _id: document._id },
    { $set: { lastExtractionId: extraction._id } },
  );

  return {
    org,
    admin,
    member,
    viewer,
    outsider,
    otherOrg,
    projectId: String(project.id),
    documentId: String(document._id),
    extractionId: String(extraction._id),
    suggestionId,
  };
}

describe('action creation', () => {
  it('creates a real action scoped to the organization', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Draft the launch plan', description: '', priority: 'HIGH', actionType: 'TASK' },
    });

    expect(action.status).toBe('TODO');
    expect(action.aiGenerated).toBe(false);

    const stored = await Action.findById(action.id).lean();
    expect(String(stored?.organizationId)).toBe(f.org.id);
  });

  it('rejects assigning an action to a user outside the organization', async () => {
    const f = await seed();
    await expect(
      createAction({
        organizationId: f.org.objectId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        input: {
          title: 'Cross-tenant assignment attempt',
          description: '',
          priority: 'MEDIUM',
          actionType: 'TASK',
          assigneeId: String(f.outsider.objectId),
        },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a project that belongs to another organization', async () => {
    const f = await seed();
    const foreignProject = await createProject({
      organizationId: f.otherOrg.objectId,
      actorId: f.outsider.objectId,
      actorName: f.outsider.name,
      input: { name: 'Foreign project', description: '', status: 'PLANNING' },
    });

    await expect(
      createAction({
        organizationId: f.org.objectId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        input: {
          title: 'Action on a foreign project',
          description: '',
          priority: 'MEDIUM',
          actionType: 'TASK',
          projectId: String(foreignProject.id),
        },
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('organization isolation', () => {
  it('never returns another organization\'s actions', async () => {
    const f = await seed();
    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Acme internal task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });
    await createAction({
      organizationId: f.otherOrg.objectId,
      actorId: f.outsider.objectId,
      actorName: f.outsider.name,
      input: { title: 'Globex internal task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    const acme = await listActions({
      organizationId: f.org.objectId,
      userId: f.admin.objectId,
      query: { page: 1, pageSize: 20, view: 'all', sort: 'createdAt', order: 'desc' },
    });

    expect(acme.items).toHaveLength(1);
    expect(acme.items[0]!.title).toBe('Acme internal task');
  });

  it('cannot read an action through a foreign organization context (IDOR)', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Acme secret task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    // Same action id, wrong tenant -> must look like it does not exist.
    await expect(
      getActionDetail({ organizationId: f.otherOrg.objectId, actionId: action.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('cannot mutate an action across tenants', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Acme task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    await expect(
      changeActionStatus({
        organizationId: f.otherOrg.objectId,
        actionId: action.id,
        actorId: f.outsider.objectId,
        actorName: f.outsider.name,
        role: 'OWNER',
        status: 'IN_PROGRESS',
      }),
    ).rejects.toThrow(NotFoundError);

    const unchanged = await Action.findById(action.id).lean();
    expect(unchanged?.status).toBe('TODO');
  });

  it('cannot delete an action across tenants', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Acme task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    await expect(
      deleteAction({
        organizationId: f.otherOrg.objectId,
        actionId: action.id,
        actorId: f.outsider.objectId,
        actorName: f.outsider.name,
        role: 'OWNER',
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await Action.countDocuments({ _id: action.id, deletedAt: null })).toBe(1);
  });
});

describe('role enforcement', () => {
  it('blocks a VIEWER from mutating actions', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Acme task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    await expect(
      changeActionStatus({
        organizationId: f.org.objectId,
        actionId: action.id,
        actorId: f.viewer.objectId,
        actorName: f.viewer.name,
        role: 'VIEWER',
        status: 'IN_PROGRESS',
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      deleteAction({
        organizationId: f.org.objectId,
        actionId: action.id,
        actorId: f.viewer.objectId,
        actorName: f.viewer.name,
        role: 'VIEWER',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows a MEMBER to update and transition actions', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.member.objectId,
      actorName: f.member.name,
      input: { title: 'Member task', description: '', priority: 'LOW', actionType: 'TASK' },
    });

    const updated = await updateAction({
      organizationId: f.org.objectId,
      actionId: action.id,
      actorId: f.member.objectId,
      actorName: f.member.name,
      role: 'MEMBER',
      input: { priority: 'URGENT' },
    });
    expect(updated.priority).toBe('URGENT');

    const progressed = await changeActionStatus({
      organizationId: f.org.objectId,
      actionId: action.id,
      actorId: f.member.objectId,
      actorName: f.member.name,
      role: 'MEMBER',
      status: 'IN_PROGRESS',
    });
    expect(progressed.status).toBe('IN_PROGRESS');
  });
});

describe('status transitions', () => {
  it('rejects an invalid transition and keeps the stored status', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Task to complete directly', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    await expect(
      changeActionStatus({
        organizationId: f.org.objectId,
        actionId: action.id,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        role: 'OWNER',
        status: 'COMPLETED',
      }),
    ).rejects.toThrow(ValidationError);

    expect((await Action.findById(action.id).lean())?.status).toBe('TODO');
  });

  it('walks TODO -> IN_PROGRESS -> COMPLETED and stamps completedAt', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Walk the workflow', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    await changeActionStatus({
      organizationId: f.org.objectId,
      actionId: action.id,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'OWNER',
      status: 'IN_PROGRESS',
    });
    const done = await changeActionStatus({
      organizationId: f.org.objectId,
      actionId: action.id,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'OWNER',
      status: 'COMPLETED',
    });

    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();
  });

  it('clears completedAt when a completed action is reopened', async () => {
    const f = await seed();
    const action = await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Reopen me', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    for (const status of ['IN_PROGRESS', 'COMPLETED'] as const) {
      await changeActionStatus({
        organizationId: f.org.objectId,
        actionId: action.id,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        role: 'OWNER',
        status,
      });
    }

    const reopened = await changeActionStatus({
      organizationId: f.org.objectId,
      actionId: action.id,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      role: 'OWNER',
      status: 'TODO',
    });

    expect(reopened.completedAt).toBeNull();
  });
});

describe('view counts and filters', () => {
  it('counts views over real rows', async () => {
    const f = await seed();
    const yesterday = new Date(Date.now() - 86_400_000);
    const tomorrow = new Date(Date.now() + 86_400_000);

    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Overdue task', description: '', priority: 'HIGH', actionType: 'TASK', dueDate: yesterday },
    });
    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Upcoming task', description: '', priority: 'LOW', actionType: 'TASK', dueDate: tomorrow },
    });

    const counts = await getActionViewCounts({
      organizationId: f.org.objectId,
      userId: f.admin.objectId,
    });

    expect(counts.all).toBe(2);
    expect(counts.overdue).toBe(1);
    expect(counts.upcoming).toBe(1);
    expect(counts.completed).toBe(0);
    expect(counts.today).toBe(0);
  });
});

describe('suggestion review', () => {
  it('requires human approval before an action exists', async () => {
    const f = await seed();
    expect(await Action.countDocuments({ organizationId: f.org.objectId })).toBe(0);

    const { action } = await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      projectId: f.projectId,
    });

    expect(action.title).toBe('Send the revised budget');
    expect(action.status).toBe('TODO');
    expect(action.assigneeId).toBe(f.member.id);
    expect(action.aiGenerated).toBe(true);
    expect(action.aiConfidence).toBeCloseTo(0.84);
    expect(action.evidence).toBe('Dana will send the revised budget by 18 April.');
    expect(action.projectId).toBe(f.projectId);
  });

  it('preserves provenance and marks the suggestion approved', async () => {
    const f = await seed();
    await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    const extraction = await DocumentExtraction.findById(f.extractionId).lean();
    const suggestion = extraction?.actions[0];

    expect(suggestion?.status).toBe('APPROVED');
    expect(String(suggestion?.reviewerId)).toBe(f.admin.id);
    expect(suggestion?.reviewedAt).toBeInstanceOf(Date);
    expect(String(suggestion?.actionId)).toBeTruthy();

    const stored = await Action.findOne({ organizationId: f.org.objectId }).lean();
    expect(String(stored?.documentId)).toBe(f.documentId);
    expect(String(stored?.extractionId)).toBe(f.extractionId);
    expect(stored?.promptVersion).toBe('extract-actions@1.0.0');
    expect(stored?.aiModel).toBe('gpt-4o-mini');
  });

  it('prevents duplicate approval of the same suggestion', async () => {
    const f = await seed();
    await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    await expect(
      approveSuggestion({
        organizationId: f.org.objectId,
        documentId: f.documentId,
        suggestionId: f.suggestionId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await Action.countDocuments({ organizationId: f.org.objectId })).toBe(1);
  });

  it('cannot approve a suggestion through another organization', async () => {
    const f = await seed();
    await expect(
      approveSuggestion({
        organizationId: f.otherOrg.objectId,
        documentId: f.documentId,
        suggestionId: f.suggestionId,
        actorId: f.outsider.objectId,
        actorName: f.outsider.name,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects an unknown suggestion id', async () => {
    const f = await seed();
    await expect(
      approveSuggestion({
        organizationId: f.org.objectId,
        documentId: f.documentId,
        suggestionId: 'does-not-exist',
        actorId: f.admin.objectId,
        actorName: f.admin.name,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('moves the document to COMPLETED once every suggestion is reviewed', async () => {
    const f = await seed();
    await rejectSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      rejectionReason: 'Already handled outside this document.',
    });

    const document = await DocumentModel.findById(f.documentId).lean();
    expect(document?.status).toBe('COMPLETED');
  });

  it('rejection creates no action and records the reviewer', async () => {
    const f = await seed();
    await rejectSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.member.objectId,
      actorName: f.member.name,
      rejectionReason: 'Not a real commitment.',
    });

    expect(await Action.countDocuments({ organizationId: f.org.objectId })).toBe(0);

    const extraction = await DocumentExtraction.findById(f.extractionId).lean();
    const suggestion = extraction?.actions[0];
    expect(suggestion?.status).toBe('REJECTED');
    expect(suggestion?.rejectionReason).toBe('Not a real commitment.');
    expect(String(suggestion?.reviewerId)).toBe(f.member.id);
  });

  it('refuses a second decision on an already reviewed suggestion', async () => {
    const f = await seed();
    await rejectSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    await expect(
      rejectSuggestion({
        organizationId: f.org.objectId,
        documentId: f.documentId,
        suggestionId: f.suggestionId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('edits a pending suggestion and flags it as human-edited', async () => {
    const f = await seed();
    await editSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Send the revised budget to the client', priority: 'URGENT' },
    });

    const extraction = await DocumentExtraction.findById(f.extractionId).lean();
    const suggestion = extraction?.actions[0];
    expect(suggestion?.title).toBe('Send the revised budget to the client');
    expect(suggestion?.priority).toBe('URGENT');
    expect(suggestion?.edited).toBe(true);

    // The AI evidence survives untouched for auditability.
    expect(suggestion?.evidence).toBe('Dana will send the revised budget by 18 April.');
  });

  it('does not allow editing an already approved suggestion', async () => {
    const f = await seed();
    await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    await expect(
      editSuggestion({
        organizationId: f.org.objectId,
        documentId: f.documentId,
        suggestionId: f.suggestionId,
        actorId: f.admin.objectId,
        actorName: f.admin.name,
        input: { title: 'Changed after approval' },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('drops an assignee who is no longer in the organization instead of creating a user', async () => {
    const f = await seed();
    // Simulate the member leaving after the suggestion was generated.
    await addMember({ organizationId: f.otherOrg.objectId, user: f.member, role: 'MEMBER' });
    await Membership.deleteOne({ organizationId: f.org.objectId, userId: f.member.objectId });

    const usersBefore = await User.countDocuments({});

    const { action } = await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    expect(action.assigneeId).toBeNull();
    // Approval must never invent a user account.
    expect(await User.countDocuments({})).toBe(usersBefore);
  });
});

describe('notifications from real events', () => {
  it('notifies the assignee when an action is assigned to someone else', async () => {
    const f = await seed();
    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: {
        title: 'Prepare the demo',
        description: '',
        priority: 'HIGH',
        actionType: 'TASK',
        assigneeId: f.member.id,
      },
    });

    const notifications = await Notification.find({ userId: f.member.objectId }).lean();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('ACTION_ASSIGNED');
  });

  it('does not notify a user about their own assignment', async () => {
    const f = await seed();
    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: {
        title: 'Self assigned',
        description: '',
        priority: 'LOW',
        actionType: 'TASK',
        assigneeId: f.admin.id,
      },
    });

    expect(await Notification.countDocuments({ userId: f.admin.objectId })).toBe(0);
  });
});

describe('audit trail', () => {
  it('records approval, creation and status changes with the actor', async () => {
    const f = await seed();
    const { actionId } = await approveSuggestion({
      organizationId: f.org.objectId,
      documentId: f.documentId,
      suggestionId: f.suggestionId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
    });

    await changeActionStatus({
      organizationId: f.org.objectId,
      actionId,
      actorId: f.member.objectId,
      actorName: f.member.name,
      role: 'MEMBER',
      status: 'IN_PROGRESS',
    });

    const events = await AuditLog.find({ organizationId: f.org.objectId }).sort({ timestamp: 1 }).lean();
    const actions = events.map((event) => event.action);

    expect(actions).toContain('SUGGESTION_APPROVED');
    expect(actions).toContain('ACTION_STATUS_CHANGED');

    const statusEvent = events.find((event) => event.action === 'ACTION_STATUS_CHANGED');
    expect(String(statusEvent?.actorId)).toBe(f.member.id);
    expect(statusEvent?.metadata).toMatchObject({ from: 'TODO', to: 'IN_PROGRESS' });
  });

  it('scopes audit events to the organization', async () => {
    const f = await seed();
    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { title: 'Audited task', description: '', priority: 'MEDIUM', actionType: 'TASK' },
    });

    expect(await AuditLog.countDocuments({ organizationId: f.otherOrg.objectId })).toBe(0);
    expect(await AuditLog.countDocuments({ organizationId: f.org.objectId })).toBeGreaterThan(0);
  });
});

describe('projects', () => {
  it('creates a project and counts only its own actions', async () => {
    const f = await seed();
    const project = await createProject({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: { name: 'Website redesign', description: '', status: 'PLANNING' },
    });

    await createAction({
      organizationId: f.org.objectId,
      actorId: f.admin.objectId,
      actorName: f.admin.name,
      input: {
        title: 'Project task',
        description: '',
        priority: 'MEDIUM',
        actionType: 'TASK',
        projectId: String(project.id),
      },
    });

    expect(await Action.countDocuments({ projectId: project.id })).toBe(1);
    expect(await Project.countDocuments({ organizationId: f.otherOrg.objectId })).toBe(0);
  });
});

describe('documents', () => {
  it('lists only documents from the requested organization', async () => {
    const f = await seed();
    await DocumentModel.create({
      organizationId: f.otherOrg.objectId,
      createdById: f.outsider.objectId,
      originalName: 'globex.txt',
      displayName: 'globex.txt',
      mimeType: 'text/plain',
      sourceType: 'TXT',
      fileSize: 10,
      storageKey: 'documents/other/file.txt',
      fileHash: 'b'.repeat(64),
      status: 'UPLOADED',
    });

    const result = await listDocuments({
      organizationId: f.org.objectId,
      query: { page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.displayName).toBe('kickoff.pdf');
    expect(result.total).toBe(1);
  });

  it('never loads extracted text into list results', async () => {
    const f = await seed();
    const result = await listDocuments({
      organizationId: f.org.objectId,
      query: { page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' },
    });

    expect(result.items[0]).not.toHaveProperty('extractedText');
  });
});