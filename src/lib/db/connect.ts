import mongoose, { type Mongoose } from 'mongoose';

/**
 * Serverless-safe Mongoose connection.
 *
 * In development / hot reload and in serverless runtimes we must reuse a single
 * connection across invocations, otherwise every request opens a new pool and
 * exhausts MongoDB Atlas connection limits.
 */
declare global {
  var __actionDocMongoose: {
    conn: Mongoose | null;
    promise: Promise<Mongoose> | null;
  } | undefined;
}

const globalCache = globalThis.__actionDocMongoose ?? { conn: null, promise: null };
globalThis.__actionDocMongoose = globalCache;

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  return uri;
}

export async function connectToDatabase(): Promise<Mongoose> {
  if (globalCache.conn) return globalCache.conn;

  if (!globalCache.promise) {
    mongoose.set('strictQuery', true);
    // Fail fast rather than hanging a request for 30s on a bad URI.
    mongoose.set('bufferCommands', false);

    globalCache.promise = mongoose
      .connect(getMongoUri(), {
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        connectTimeoutMS: 10_000,
        maxIdleTimeMS: 60_000,
      })
      .catch((error) => {
        globalCache.promise = null;
        throw error;
      });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (!globalCache.conn) return;
  await mongoose.disconnect();
  globalCache.conn = null;
  globalCache.promise = null;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export { mongoose };