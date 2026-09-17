import mongoose, { type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';

export type TransactionSession = ClientSession | null;

export function isTransactionUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: number; message?: string; errmsg?: string; originalError?: unknown };
  const msg = err.message || err.errmsg || '';
  const origMsg = (err.originalError as { message?: string })?.message || '';
  const fullMsg = `${msg} ${origMsg}`;
  return (
    err.code === 20 ||
    fullMsg.includes('Transaction numbers are only allowed') ||
    fullMsg.includes('does not support retryable writes') ||
    fullMsg.includes('replica set member')
  );
}

export function supportsTransactions(): boolean {
  try {
    const conn = mongoose.connection as unknown as { getClient?: () => unknown; client?: unknown };
    const client = typeof conn.getClient === 'function' ? conn.getClient() : conn.client;
    if (!client) return false;
    const topology = (client as { topology?: unknown }).topology as {
      hasTransactions?: () => boolean;
      description?: { type?: string };
    } | undefined;
    if (!topology) return false;
    if (typeof topology.hasTransactions === 'function') {
      return topology.hasTransactions();
    }
    const descType = topology.description?.type;
    if (descType === 'Single' || descType === 'Unknown') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `fn` inside a MongoDB transaction when the deployment supports one.
 *
 * Transactions require a replica set (MongoDB Atlas always is; a local
 * standalone mongod is not). When a session cannot be started we fall back to
 * running without one: callers must therefore still make their writes safe via
 * conditional updates, and treat the session as an optimisation rather than a
 * correctness guarantee.
 */
export async function withTransaction<T>(fn: (session: TransactionSession) => Promise<T>): Promise<T> {
  await connectToDatabase();

  let session: ClientSession | null = null;
  if (supportsTransactions()) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (error) {
      console.warn('[db] transactions unavailable, continuing without a session', {
        error: error instanceof Error ? error.message : String(error),
      });
      session = null;
    }
  }

  try {
    const result = await fn(session);
    if (session) await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      await session.abortTransaction().catch(() => undefined);
    }
    if (session && isTransactionUnsupportedError(error)) {
      console.warn('[db] transaction failed due to unsupported deployment, retrying without session');
      return fn(null);
    }
    throw error;
  } finally {
    if (session) await session.endSession().catch(() => undefined);
  }
}