/**
 * Start a local MongoDB replica set for development and verification.
 *
 * Uses `mongodb-memory-server`, so it needs no system MongoDB install. A
 * replica set is used (not a standalone) because the application relies on
 * transactions for approval, which require replica-set semantics.
 *
 *   node scripts/dev-mongo.mjs
 *   MONGODB_URI=mongodb://127.0.0.1:27017/actiondoc?replicaSet=rs0
 *
 * Data lives only for the lifetime of this process - it is a development aid,
 * not a database.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const port = Number(process.env.DEV_MONGO_PORT ?? 27017);

const replicaSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbName: 'actiondoc' }],
});

const uri = replicaSet.getUri('actiondoc');
console.log(`MongoDB replica set ready:\n  MONGODB_URI=${uri}`);

async function shutdown() {
  await replicaSet.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);