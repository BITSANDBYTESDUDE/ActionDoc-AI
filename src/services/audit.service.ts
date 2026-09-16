import type { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { AuditLog, type AUDIT_ACTIONS } from '@/models/AuditLog';

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  organizationId: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  actorName?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: Types.ObjectId | null;
  /** Ids, names and statuses only. Never document content or secrets. */
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit logging.
 *
 * Audit writes must never break the user-facing operation, so failures are
 * logged and swallowed. There is deliberately no update or delete function.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create({
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: sanitiseMetadata(input.metadata ?? {}),
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[audit] failed to record event', {
      action: input.action,
      entityType: input.entityType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Guard against accidentally persisting large or sensitive payloads. */
function sanitiseMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/password|secret|token|apikey|api_key|authorization/i.test(key)) continue;
    if (typeof value === 'string') {
      output[key] = value.slice(0, 500);
    } else if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 50).map((item) => (typeof item === 'string' ? item.slice(0, 200) : item));
    } else if (value instanceof Date) {
      output[key] = value.toISOString();
    } else if (value && typeof value === 'object') {
      output[key] = JSON.parse(JSON.stringify(value).slice(0, 2000));
    }
  }
  return output;
}

export async function listAuditEvents(params: {
  organizationId: Types.ObjectId;
  limit: number;
  before?: Date;
}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = { organizationId: params.organizationId };
  if (params.before) filter.timestamp = { $lt: params.before };

  return AuditLog.find(filter).sort({ timestamp: -1 }).limit(params.limit).lean();
}