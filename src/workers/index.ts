/**
 * Background worker entrypoint (`npm run worker`).
 *
 * Kept separate from the Next.js server so document processing is not tied to a
 * request lifecycle. Deploy this as a long-running process (Railway, Fly.io, a
 * VPS, or a container) with the same environment variables as the web app.
 */
import { startDocumentWorker } from '@/workers/document.worker';
import { connectToDatabase } from '@/lib/db/connect';
import { closeRedis } from '@/lib/db/redis';

async function main() {
  console.log('[worker] starting ActionDoc AI document worker');

  await connectToDatabase();
  console.log('[worker] connected to MongoDB');

  const shutdown = await startDocumentWorker();

  let shuttingDown = false;
  const handleSignal = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down gracefully`);

    try {
      // Stop accepting jobs, then release connections.
      await shutdown();
      await closeRedis();
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
      console.log('[worker] shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[worker] error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleSignal('SIGINT'));
  process.on('SIGTERM', () => void handleSignal('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandled rejection', reason);
  });
}

main().catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});