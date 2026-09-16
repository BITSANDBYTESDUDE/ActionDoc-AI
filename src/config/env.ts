/**
 * Centralised, validated environment access.
 *
 * Importing this module never throws for optional integrations (storage, redis,
 * email, openai). Each capability exposes a boolean so the application can
 * degrade gracefully and surface a clear configuration error instead of
 * crashing at import time.
 */
import { z } from 'zod';

const requiredServerSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
});

const optionalServerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  OPENAI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(48_000),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  REDIS_URL: z.string().optional(),
  DOCUMENT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ENABLE_INLINE_WORKER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  /** `s3` (default) or `memory` for dependency-free local development and tests. */
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('ActionDoc AI <notifications@actiondoc.ai>'),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
});

export type ServerEnv = z.infer<typeof optionalServerSchema> & {
  AUTH_SECRET: string;
  MONGODB_URI: string;
};

let cached: ServerEnv | null = null;

function loadEnv(): ServerEnv {
  if (cached) return cached;

  const required = requiredServerSchema.safeParse({
    MONGODB_URI: process.env.MONGODB_URI,
    AUTH_SECRET: process.env.AUTH_SECRET,
  });

  if (!required.success) {
    const issues = required.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = { ...optionalServerSchema.parse(process.env), ...required.data };
  return cached;
}

/**
 * Lazily validated environment: property access validates on first use so that
 * importing this module in a partial environment does not throw.
 */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') return undefined;
    return loadEnv()[prop as keyof ServerEnv];
  },
  has(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') return false;
    return prop in loadEnv();
  },
});

export const capabilities = {
  get openai() {
    return Boolean(process.env.OPENAI_API_KEY);
  },
  get storage() {
    if (process.env.STORAGE_DRIVER === 'memory') return true;
    return Boolean(
      process.env.S3_ENDPOINT &&
        process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID &&
        process.env.S3_SECRET_ACCESS_KEY,
    );
  },
  get redis() {
    return Boolean(process.env.REDIS_URL);
  },
  get email() {
    return Boolean(process.env.RESEND_API_KEY);
  },
};

export function resetEnvCache() {
  cached = null;
}