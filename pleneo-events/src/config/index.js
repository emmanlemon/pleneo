import dotenv from 'dotenv';
import { hostname } from 'node:os';
import { z } from 'zod';

dotenv.config({ quiet: true });

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');
const optionalString = (inner) => z.preprocess((v) => (v === '' ? undefined : v), inner.optional());
const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4200),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: bool('true'),
  DOCS_ENABLED: bool('true'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  AUTH_JWKS_URL: optionalString(z.string().url()),

  INTERNAL_IDENTITY_KEY: optionalString(z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex')),
  INTERNAL_IDENTITY_ISSUER: z.string().min(1).default('pleneo-gateway'),
  INTERNAL_IDENTITY_AUDIENCE: z.string().min(1).default('pleneo-events'),

  AUTHZERO_WEBHOOK_SECRET: z.string().min(32),
  SECRETS_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex'),
  SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(30).default(300),

  WORKER_ENABLED: bool('true'),
  WORKER_ID: optionalString(z.string().min(1)),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  WORKER_QUEUES: csv,
  JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  JOB_LOCK_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(300),
  JOB_RETENTION_DAYS: z.coerce.number().int().min(1).default(14),
  BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(5_000),
  BACKOFF_MAX_MS: z.coerce.number().int().min(1000).default(3_600_000),
  SCHEDULER_ENABLED: bool('true'),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
  QUEUE_SIGNAL_ENABLED: bool('true'),
  QUEUE_SIGNAL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2000),

  APP_BASE_URL: z.string().url(),
  EMAIL_PROVIDER: z.enum(['log', 'gmail', 'mailtrap']).default('log'),
  MAILTRAP_API_KEY: optionalString(z.string().min(1)),
  MAILTRAP_INBOX_ID: optionalString(z.coerce.number().int().positive()),
  EMAIL_FROM: z.string().min(3),
  GMAIL_USER: optionalString(z.string().email()),
  GMAIL_APP_PASSWORD: optionalString(z.string().min(1)),
  GMAIL_CLIENT_ID: optionalString(z.string().min(1)),
  GMAIL_CLIENT_SECRET: optionalString(z.string().min(1)),
  GMAIL_REFRESH_TOKEN: optionalString(z.string().min(1)),

  CORS_ORIGINS: csv,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const data = parsed.data;
export const config = Object.freeze({
  ...data,
  AUTH_JWKS_URL: data.AUTH_JWKS_URL ?? `${data.AUTH_ISSUER.replace(/\/$/, '')}/.well-known/jwks.json`,
  WORKER_ID: data.WORKER_ID ?? `${hostname()}:${process.pid}`,
  WORKER_QUEUES: data.WORKER_QUEUES.length ? data.WORKER_QUEUES : ['default', 'webhooks', 'email', 'system'],
  isProd: data.NODE_ENV === 'production',
});

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
if (config.EMAIL_PROVIDER === 'gmail') {
  const oauth = config.GMAIL_CLIENT_ID && config.GMAIL_CLIENT_SECRET && config.GMAIL_REFRESH_TOKEN;
  if (!config.GMAIL_USER || !(config.GMAIL_APP_PASSWORD || oauth)) {
    fail(
      'EMAIL_PROVIDER=gmail requires GMAIL_USER and either GMAIL_APP_PASSWORD or GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN',
    );
  }
}
if (config.EMAIL_PROVIDER === 'mailtrap' && !config.MAILTRAP_API_KEY) {
  fail('EMAIL_PROVIDER=mailtrap requires MAILTRAP_API_KEY');
}
if (config.isProd && !config.RATE_LIMIT_ENABLED) fail('RATE_LIMIT_ENABLED must be true in production');
