import mongoose, { type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';

export type TransactionSession = ClientSession | null;

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
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (error) {
    console.warn('[db] transactions unavailable, continuing without a session', {
      error: error instanceof Error ? error.message : String(error),
    });
    session = null;
  }

  try {
    const result = await fn(session);
    if (session) await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      await session.abortTransaction().catch(() => undefined);
    }
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}