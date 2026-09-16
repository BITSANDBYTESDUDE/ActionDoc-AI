/**
 * Global Vitest setup.
 *
 * Runs before every test file. Only environment *shape* is set here - no real
 * credentials are ever used. Integration tests replace MONGODB_URI with the
 * in-memory server started in `tests/setup/db.ts`.
 */
// `NODE_ENV` is read-only in the Next.js type definitions; Vitest already runs
// with NODE_ENV=test, so assert it rather than assigning through a cast.
process.env.AUTH_SECRET = 'test-secret-value-at-least-16-chars';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Optional integrations are intentionally left unconfigured so tests exercise
// the graceful-degradation paths (no OpenAI calls, no Redis, no S3, no email).
delete process.env.OPENAI_API_KEY;
delete process.env.REDIS_URL;
delete process.env.S3_ENDPOINT;
delete process.env.S3_BUCKET;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;
delete process.env.RESEND_API_KEY;

// Keep upload limits small so the size-validation path is cheap to test.
process.env.MAX_UPLOAD_BYTES = String(2 * 1024 * 1024);

// In-memory object storage so the document pipeline runs without S3 credentials.
process.env.STORAGE_DRIVER = 'memory';
