import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');
const optionalString = (inner) => z.preprocess((v) => (v === '' ? undefined : v), inner.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: bool('true'),
  DOCS_ENABLED: bool('true'),
  SOCKET_ENABLED: bool('true'),
  SOCKET_PATH: z.string().startsWith('/').default('/socket.io'),
  SOCKET_PING_INTERVAL_MS: z.coerce.number().int().min(1000).default(25000),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  AUTH_JWKS_URL: optionalString(z.string().url()),
  AUTH_INTERNAL_URL: optionalString(z.string().url()),
  AUTH_INTROSPECTION_ENABLED: bool('false'),
  AUTH_CLIENT_ID: optionalString(z.string().min(1)),
  AUTH_CLIENT_SECRET: optionalString(z.string().min(1)),
  AUTH_INTROSPECTION_CACHE_SECONDS: z.coerce.number().int().min(0).max(900).default(60),

  EVENTS_URL: optionalString(z.string().url()),
  EVENTS_CLIENT_ID: optionalString(z.string().min(1)),
  EVENTS_CLIENT_SECRET: optionalString(z.string().min(1)),
  EVENTS_WEBHOOK_SECRET: optionalString(z.string().min(32)),
  IOT_URL: optionalString(z.string().url()),

  BFF_ENABLED: bool('true'),
  BFF_SESSION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex'),
  BFF_COOKIE_NAME: z.string().min(1).default('planeo_session'),
  BFF_CSRF_COOKIE_NAME: z.string().min(1).default('planeo_csrf'),
  BFF_COOKIE_SECURE: bool('false'),
  BFF_COOKIE_DOMAIN: optionalString(z.string().min(1)),
  BFF_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BFF_REFRESH_SKEW_SECONDS: z.coerce.number().int().min(10).max(600).default(60),

  INTERNAL_IDENTITY_KEY: optionalString(z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex')),
  INTERNAL_IDENTITY_ISSUER: z.string().min(1).default('planeo-gateway'),
  INTERNAL_IDENTITY_TTL_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
  GATEWAY_BREAKER_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
  GATEWAY_BREAKER_RESET_MS: z.coerce.number().int().min(1000).max(300_000).default(15_000),
  GATEWAY_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).default(2_000_000),
  GATEWAY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  OUTBOX_ENABLED: bool('true'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  NOTIFY_EMAIL_ENABLED: bool('false'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
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
  AUTH_INTERNAL_URL: (data.AUTH_INTERNAL_URL ?? data.AUTH_ISSUER).replace(/\/$/, ''),
  IOT_URL: data.IOT_URL?.replace(/\/$/, ''),
  EVENTS_URL: data.EVENTS_URL?.replace(/\/$/, ''),
  isProd: data.NODE_ENV === 'production',
});

if (config.AUTH_INTROSPECTION_ENABLED && !(config.AUTH_CLIENT_ID && config.AUTH_CLIENT_SECRET)) {
  process.stderr.write('AUTH_CLIENT_ID and AUTH_CLIENT_SECRET are required when introspection is enabled\n');
  process.exit(1);
}
if (config.OUTBOX_ENABLED && !(config.EVENTS_URL && config.EVENTS_CLIENT_ID && config.EVENTS_CLIENT_SECRET)) {
  process.stderr.write(
    'EVENTS_URL, EVENTS_CLIENT_ID and EVENTS_CLIENT_SECRET are required while OUTBOX_ENABLED=true\n',
  );
  process.exit(1);
}
if (config.BFF_ENABLED && !config.IOT_URL) {
  process.stderr.write('IOT_URL is required while BFF_ENABLED=true so the gateway can reach planeo-iot\n');
  process.exit(1);
}
if (config.isProd && config.BFF_ENABLED && !config.BFF_COOKIE_SECURE) {
  process.stderr.write('BFF_COOKIE_SECURE must be true in production\n');
  process.exit(1);
}
if (config.isProd && config.BFF_ENABLED && !config.INTERNAL_IDENTITY_KEY) {
  process.stderr.write('INTERNAL_IDENTITY_KEY is required in production so upstreams need not call the identity provider\n');
  process.exit(1);
}
if (config.isProd && !config.RATE_LIMIT_ENABLED) {
  process.stderr.write('RATE_LIMIT_ENABLED must be true in production\n');
  process.exit(1);
}
