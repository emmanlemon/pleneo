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
  PORT: z.coerce.number().int().positive().default(4300),
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
  AUTH_INTERNAL_URL: optionalString(z.string().url()),

  INTERNAL_IDENTITY_KEY: optionalString(z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex')),
  INTERNAL_IDENTITY_ISSUER: z.string().min(1).default('pleneo-gateway'),
  INTERNAL_IDENTITY_AUDIENCE: z.string().min(1).default('pleneo-iot'),

  DEVICE_SECRET_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex'),

  INGEST_MAX_BATCH: z.coerce.number().int().min(1).max(5000).default(500),
  INGEST_MAX_SKEW_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  INGEST_MAX_BACKFILL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  DEVICE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),

  MQTT_ENABLED: bool('true'),
  MQTT_HOST: z.string().default('0.0.0.0'),
  MQTT_PORT: z.coerce.number().int().positive().default(1883),
  MQTT_MAX_PAYLOAD_BYTES: z.coerce.number().int().min(256).max(1_048_576).default(131_072),
  MQTT_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  MQTT_TLS_KEY_PATH: optionalString(z.string().min(1)),
  MQTT_TLS_CERT_PATH: optionalString(z.string().min(1)),

  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().min(10).default(120),
  OFFLINE_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  COMMAND_DEFAULT_TTL_SECONDS: z.coerce.number().int().min(10).max(86_400).default(300),
  TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),

  EVENTS_URL: optionalString(z.string().url()),
  EVENTS_CLIENT_ID: optionalString(z.string().min(1)),
  EVENTS_CLIENT_SECRET: optionalString(z.string().min(1)),
  OUTBOX_ENABLED: bool('true'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),

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
  isProd: data.NODE_ENV === 'production',
});

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
if (config.OUTBOX_ENABLED && !(config.EVENTS_URL && config.EVENTS_CLIENT_ID && config.EVENTS_CLIENT_SECRET)) {
  fail('EVENTS_URL, EVENTS_CLIENT_ID and EVENTS_CLIENT_SECRET are required while OUTBOX_ENABLED=true');
}
if (config.isProd && !config.RATE_LIMIT_ENABLED) fail('RATE_LIMIT_ENABLED must be true in production');
if (Boolean(config.MQTT_TLS_KEY_PATH) !== Boolean(config.MQTT_TLS_CERT_PATH)) {
  fail('MQTT_TLS_KEY_PATH and MQTT_TLS_CERT_PATH must be set together');
}
