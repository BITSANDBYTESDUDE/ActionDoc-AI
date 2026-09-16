import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestOrganization,
  createTestUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from '../setup/db';
import {
  createDocumentFromUpload,
  deleteDocument,
  getDocumentDetail,
  getDocumentExtractedText,
  listDocuments,
} from '@/services/document.service';
import { extractDocumentTextForDocument } from '@/services/extraction.service';
import { analyzeDocument, dedupeSuggestions } from '@/lib/ai/analyze';
import { Document as DocumentModel } from '@/models/Document';
import { AuditLog } from '@/models/AuditLog';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { validateUpload } from '@/lib/storage/keys';
import { getStorage, resetStorageCache } from '@/lib/storage';
import { clearMemoryStorage } from '@/lib/storage/memory-storage';
import { normalizeDocumentText } from '@/lib/documents/normalize';
import type { AiSuggestion } from '@/lib/ai/schema';

beforeAll(async () => {
  await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  clearMemoryStorage();
  resetStorageCache();
});

function textFile(content: string, name = 'meeting-notes.txt') {
  const bytes = new TextEncoder().encode(content);
  return validateUpload({
    fileName: name,
    mimeType: 'text/plain',
    bytes,
    maxBytes: 2 * 1024 * 1024,
  });
}

const MEETING_NOTES = `Weekly project sync

Attendees: Ada Admin, Mia Member

Decisions
- We agreed to launch the beta on 30 April.
- The old reporting module will be retired.

Actions
- Mia will send the revised budget to the client by 18 April.
- Ada to review the security checklist before the beta launch.
- Follow up with the design agency about the new brand assets.
`;

async function seedOrg() {
  const admin = await createTestUser({ name: 'Ada Admin' });
  const org = await createTestOrganization({ owner: admin, name: 'Pipeline Inc' });
  return { admin, org };
}

describe('upload -> extract -> normalise pipeline', () => {
  it('stores the file out-of-band and keeps only metadata in MongoDB', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES);

    const summary = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    expect(summary.status).toBe('UPLOADED');
    expect(summary.displayName).toBe('meeting-notes.txt');

    const stored = await DocumentModel.findById(summary.id).lean();
    // The raw bytes must never live in the database.
    expect(JSON.stringify(stored)).not.toContain('revised budget to the client');

    const storage = getStorage();
    const bytes = await storage.getObjectBody(stored!.storageKey);
    expect(new TextDecoder().decode(bytes)).toContain('revised budget');
  });

  it('extracts text and derives document statistics', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES);
    const created = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    const result = await extractDocumentTextForDocument({
      organizationId: org.objectId,
      documentId: created.id,
    });

    expect(result.text).toContain('revised budget');
    expect(result.extractionMethod).toBe('text/decode');
    expect(result.warnings).toEqual([]);

    const document = await DocumentModel.findById(created.id).lean();
    expect(document?.status).toBe('EXTRACTED');
    expect(document?.metadata?.wordCount).toBeGreaterThan(20);
    expect(document?.metadata?.charCount).toBe(result.text.length);
    expect(document?.processingCompletedAt).toBeInstanceOf(Date);
  });

  it('normalises the extracted text before it is stored', async () => {
    const { admin, org } = await seedOrg();
    const messy = 'Notes\r\n\r\n\r\n\r\nTask 1:  review   the  plan\r\nTask 2: done';
    const file = textFile(messy);
    const created = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(messy) },
    });

    await extractDocumentTextForDocument({ organizationId: org.objectId, documentId: created.id });

    const detail = await getDocumentExtractedText({ organizationId: org.objectId, documentId: created.id });
    expect(detail?.text).toBe(normalizeDocumentText(messy).text);
    expect(detail?.text).not.toContain('\r');
    expect(detail?.text).not.toContain('  ');
  });

  it('moves a document with no readable text to REVIEW with a warning', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile('   \n\n   ');
    const created = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode('   \n\n   ') },
    });

    const result = await extractDocumentTextForDocument({
      organizationId: org.objectId,
      documentId: created.id,
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    const document = await DocumentModel.findById(created.id).lean();
    expect(document?.status).toBe('REVIEW');
  });

  it('detects a duplicate upload by content hash within the same organization', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES);
    const bytes = new TextEncoder().encode(MEETING_NOTES);

    await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes },
    });

    await expect(
      createDocumentFromUpload({
        organizationId: org.objectId,
        userId: admin.objectId,
        userName: admin.name,
        file: { ...file, bytes },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('allows the same file in two different organizations', async () => {
    const { admin, org } = await seedOrg();
    const other = await createTestUser({ name: 'Olive' });
    const otherOrg = await createTestOrganization({ owner: other, name: 'Other Inc' });
    const file = textFile(MEETING_NOTES);
    const bytes = new TextEncoder().encode(MEETING_NOTES);

    await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes },
    });
    const second = await createDocumentFromUpload({
      organizationId: otherOrg.objectId,
      userId: other.objectId,
      userName: other.name,
      file: { ...file, bytes },
    });

    expect(second.status).toBe('UPLOADED');
  });

  it('records a document upload audit event', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES);
    await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    const event = await AuditLog.findOne({ organizationId: org.objectId, action: 'DOCUMENT_UPLOADED' }).lean();
    expect(event).not.toBeNull();
    expect(String(event?.actorId)).toBe(admin.id);
  });

  it('cannot read or extract a document belonging to another organization', async () => {
    const { admin, org } = await seedOrg();
    const other = await createTestUser({ name: 'Olive' });
    const otherOrg = await createTestOrganization({ owner: other, name: 'Other Inc' });
    const file = textFile(MEETING_NOTES);
    const created = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    await expect(
      getDocumentDetail({ organizationId: otherOrg.objectId, documentId: created.id }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      extractDocumentTextForDocument({ organizationId: otherOrg.objectId, documentId: created.id }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      deleteDocument({
        organizationId: otherOrg.objectId,
        documentId: created.id,
        actorId: other.objectId,
        actorName: other.name,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await DocumentModel.countDocuments({ _id: created.id, deletedAt: null })).toBe(1);
  });

  it('soft-deletes a document, removes the object and detaches its actions', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES);
    const created = await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    const stored = await DocumentModel.findById(created.id).lean();
    const storage = getStorage();

    await deleteDocument({
      organizationId: org.objectId,
      documentId: created.id,
      actorId: admin.objectId,
      actorName: admin.name,
    });

    expect(await storage.headObject(stored!.storageKey)).toBeNull();

    const after = await DocumentModel.findById(created.id).lean();
    expect(after?.deletedAt).toBeInstanceOf(Date);

    // Deleted documents disappear from the library.
    const list = await listDocuments({
      organizationId: org.objectId,
      query: { page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' },
    });
    expect(list.items).toHaveLength(0);
  });

  it('escapes regex metacharacters in search so it cannot be used as a payload', async () => {
    const { admin, org } = await seedOrg();
    const file = textFile(MEETING_NOTES, 'report.txt');
    await createDocumentFromUpload({
      organizationId: org.objectId,
      userId: admin.objectId,
      userName: admin.name,
      file: { ...file, bytes: new TextEncoder().encode(MEETING_NOTES) },
    });

    const result = await listDocuments({
      organizationId: org.objectId,
      query: { page: 1, pageSize: 20, search: '.*', sort: 'createdAt', order: 'desc' },
    });

    // ".*" is treated literally, so it matches nothing rather than everything.
    expect(result.items).toHaveLength(0);
  });
});

describe('AI analysis stage', () => {
  it('fails clearly when the AI provider is not configured', async () => {
    await expect(
      analyzeDocument({ documentId: 'x', documentName: 'x.txt', text: 'Some text' }),
    ).rejects.toThrow(/not configured/i);
  });

  it('completes a document with no readable text without calling the AI provider', async () => {
    // An empty document short-circuits before the provider, so this path is
    // exercised even with OPENAI_API_KEY unset.
    const { runAnalysisForDocument } = await import('@/services/ai.service');
    const { admin, org } = await seedOrg();

    const document = await DocumentModel.create({
      organizationId: org.objectId,
      createdById: admin.objectId,
      originalName: 'blank.txt',
      displayName: 'blank.txt',
      mimeType: 'text/plain',
      sourceType: 'TXT',
      fileSize: 3,
      storageKey: `documents/${org.id}/2026/04/blank/file.txt`,
      fileHash: 'c'.repeat(64),
      status: 'REVIEW',
      extractedText: '',
    });

    const result = await runAnalysisForDocument({
      organizationId: org.objectId,
      documentId: String(document._id),
    });

    expect(result.suggestionCount).toBe(0);
    expect(result.summary).toMatch(/no readable text/i);

    // Nothing to review, and nothing actionable was invented.
    const after = await DocumentModel.findById(document._id).lean();
    expect(after?.status).toBe('COMPLETED');

    const { DocumentExtraction } = await import('@/models/DocumentExtraction');
    const extraction = await DocumentExtraction.findOne({ documentId: document._id }).lean();
    expect(extraction?.actions).toHaveLength(0);
    expect(extraction?.status).toBe('COMPLETED');
  });

  it('de-duplicates near-identical suggestions keeping the highest confidence', () => {
    const base: AiSuggestion = {
      title: 'Send the revised budget',
      description: '',
      assigneeName: null,
      dueDate: null,
      priority: 'MEDIUM',
      confidence: 0.5,
      evidence: 'evidence',
      sourceLocation: null,
      actionType: 'TASK',
    };

    const deduped = dedupeSuggestions([
      { ...base, confidence: 0.4 },
      { ...base, title: '  send   the revised BUDGET! ', confidence: 0.9 },
      { ...base, title: 'Review the security checklist', confidence: 0.7 },
    ]);

    expect(deduped).toHaveLength(2);
    // The winning entry is the highest-confidence one, keeping its own title.
    expect(deduped.find((s) => s.title.toLowerCase().includes('budget'))?.confidence).toBe(0.9);
  });
});

describe('analysis guard rails', () => {
  it('refuses to analyse a document that is already being processed', async () => {
    const { runAnalysisForDocument } = await import('@/services/ai.service');
    const { admin, org } = await seedOrg();

    const document = await DocumentModel.create({
      organizationId: org.objectId,
      createdById: admin.objectId,
      originalName: 'busy.txt',
      displayName: 'busy.txt',
      mimeType: 'text/plain',
      sourceType: 'TXT',
      fileSize: 10,
      storageKey: `documents/${org.id}/2026/04/busy/file.txt`,
      fileHash: 'd'.repeat(64),
      status: 'PROCESSING',
      extractedText: 'Some content',
    });

    await expect(
      runAnalysisForDocument({ organizationId: org.objectId, documentId: String(document._id) }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('unconfigured openai degrades cleanly', () => {
  it('does not call the provider when no API key is set', async () => {
    const { getGenerationProvider } = await import('@/lib/ai');
    const provider = getGenerationProvider();
    expect(provider.isConfigured).toBe(false);
    await expect(
      provider.generateStructured({
        system: 's',
        user: 'u',
        jsonSchema: {},
        schemaName: 'x',
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

// Keep `vi` referenced for future fake-timer needs without failing lint.
void vi;