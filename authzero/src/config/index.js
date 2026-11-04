import 'dotenv/config';
import { z } from 'zod';

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');
const optionalString = (inner) => z.preprocess((v) => (v === '' ? undefined : v), inner.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: bool('true'),
  DOCS_ENABLED: bool('true'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  KEY_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex'),

  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  SIGNING_KEY_ROTATION_DAYS: z.coerce.number().int().min(1).default(90),

  REQUIRE_EMAIL_VERIFICATION: bool('true'),
  EMAIL_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  INVITE_TTL_MINUTES: z.coerce.number().int().positive().default(4320),
  MAX_FAILED_LOGINS: z.coerce.number().int().min(1).default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  PASSWORD_HISTORY_SIZE: z.coerce.number().int().min(0).default(5),
  ADMIN_REQUIRE_MFA: bool('false'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  COOKIE_NAME: z.string().min(1).default('rt'),
  COOKIE_SECURE: bool('false'),
  COOKIE_DOMAIN: optionalString(z.string().min(1)),

  EVENT_WEBHOOK_URL: optionalString(z.string().url()),
  EVENT_WEBHOOK_SECRET: optionalString(z.string().min(32)),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
});

if (config.isProd && !config.COOKIE_SECURE) {
  process.stderr.write('COOKIE_SECURE must be true in production\n');
  process.exit(1);
}
if (config.isProd && !config.RATE_LIMIT_ENABLED) {
  process.stderr.write('RATE_LIMIT_ENABLED must be true in production\n');
  process.exit(1);
}
if (config.EVENT_WEBHOOK_URL && !config.EVENT_WEBHOOK_SECRET) {
  process.stderr.write('EVENT_WEBHOOK_SECRET is required when EVENT_WEBHOOK_URL is set\n');
  process.exit(1);
}
