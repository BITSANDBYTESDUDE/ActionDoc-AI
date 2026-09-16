import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connect';
import { getAiConfigurationStatus } from '@/lib/ai';
import { getStorage } from '@/lib/storage';
import { isQueueConfigured } from '@/lib/queue/document.queue';
import { isEmailConfigured } from '@/lib/notifications/email';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Liveness/readiness probe. Reports which external services are configured
 * without ever echoing credentials. Returns 503 when the database - the only
 * hard dependency - is unreachable.
 */
export async function GET() {
  const startedAt = Date.now();

  let database: 'ok' | 'unavailable' = 'ok';
  let databaseError: string | undefined;

  try {
    await connectToDatabase();
  } catch (error) {
    database = 'unavailable';
    // Message only; connection strings never appear here.
    databaseError = error instanceof Error ? error.message : 'Unknown database error';
  }

  const ai = getAiConfigurationStatus();

  const body = {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    ...(databaseError ? { databaseError } : {}),
    latencyMs: Date.now() - startedAt,
    services: {
      ai: { configured: ai.configured, model: ai.configured ? ai.model : null },
      storage: { configured: getStorage().isConfigured },
      queue: { configured: isQueueConfigured() },
      email: { configured: isEmailConfigured() },
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: database === 'ok' ? 200 : 503 });
}