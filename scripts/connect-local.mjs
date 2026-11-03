import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:4000';
const EVENTS_URL = process.env.EVENTS_URL ?? 'http://localhost:4200';
const API_URL = process.env.API_URL ?? 'http://localhost:4100';
const IOT_URL = process.env.IOT_URL ?? 'http://localhost:4300';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DB_BASE = process.env.DB_BASE ?? 'postgres://authzero:authzero@localhost:5432';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) fail('Set ADMIN_EMAIL and ADMIN_PASSWORD (an authzero admin) in the environment.');

const files = {
  authzero: path.join(root, 'authzero', '.env'),
  events: path.join(root, 'pleneo-events', '.env'),
  backend: path.join(root, 'pleneo-management', 'backend', '.env'),
  iot: path.join(root, 'pleneo-iot', '.env'),
  frontend: path.join(root, 'pleneo-management', 'frontend', '.env.local'),
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ensureEnv(file, example) {
  if (!existsSync(file)) {
    if (!existsSync(example)) fail(`Missing ${example}`);
    copyFileSync(example, file);
  }
}

function readEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

function upsertEnv(file, entries) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [key, value] of Object.entries(entries)) {
    const index = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(file, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

async function json(url, { method = 'GET', body, token, basic } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(basic ? { authorization: `Basic ${basic}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${data.detail ?? data.code ?? ''}`);
  return data;
}

const hex = (bytes) => randomBytes(bytes).toString('hex');
const token48 = () => randomBytes(36).toString('base64url');

async function main() {
  ensureEnv(files.authzero, path.join(root, 'authzero', '.env.example'));
  ensureEnv(files.events, path.join(root, 'pleneo-events', '.env.example'));
  ensureEnv(files.backend, path.join(root, 'pleneo-management', 'backend', '.env.example'));
  ensureEnv(files.iot, path.join(root, 'pleneo-iot', '.env.example'));
  ensureEnv(files.frontend, path.join(root, 'pleneo-management', 'frontend', '.env.example'));

  const eventsEnv = readEnv(files.events);
  const authzeroEnv = readEnv(files.authzero);
  const authzeroWebhookSecret = authzeroEnv.EVENT_WEBHOOK_SECRET || eventsEnv.AUTHZERO_WEBHOOK_SECRET || token48();
  const secretsKey = /^[0-9a-f]{64}$/i.test(eventsEnv.SECRETS_ENCRYPTION_KEY ?? '')
    ? eventsEnv.SECRETS_ENCRYPTION_KEY
    : hex(32);
  const backendEnv = readEnv(files.backend);
  const managementWebhookSecret = backendEnv.EVENTS_WEBHOOK_SECRET || token48();
  const bffSessionKey = /^[0-9a-f]{64}$/i.test(backendEnv.BFF_SESSION_KEY ?? '') ? backendEnv.BFF_SESSION_KEY : hex(32);
  const identityKey = /^[0-9a-f]{64}$/i.test(backendEnv.INTERNAL_IDENTITY_KEY ?? '')
    ? backendEnv.INTERNAL_IDENTITY_KEY
    : hex(32);
  const iotEnv = readEnv(files.iot);
  const deviceSecretKey = /^[0-9a-f]{64}$/i.test(iotEnv.DEVICE_SECRET_KEY ?? '') ? iotEnv.DEVICE_SECRET_KEY : hex(32);

  process.stdout.write(`Signing in to authzero as ${ADMIN_EMAIL}\n`);
  const login = await json(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (login.mfaRequired) fail('Admin account has MFA enabled; create the client manually via POST /admin/clients.');
  const admin = login.accessToken;

  const { clients } = await json(`${AUTH_URL}/admin/clients`, { token: admin });
  const createClient = async (name, scopes) => {
    for (const existing of clients.filter((c) => c.name === name && c.status === 'active')) {
      await json(`${AUTH_URL}/admin/clients/${existing.id}`, { method: 'DELETE', token: admin }).catch(() => undefined);
    }
    const created = await json(`${AUTH_URL}/admin/clients`, { method: 'POST', token: admin, body: { name, scopes } });
    process.stdout.write(`Created authzero client ${created.client_id} (${name})\n`);
    return created;
  };

  const client = await createClient('pleneo-management-backend', ['events:publish', 'jobs:enqueue', 'projects:read']);
  const iotClient = await createClient('pleneo-iot', ['events:publish']);

  upsertEnv(files.authzero, {
    EVENT_WEBHOOK_URL: `${EVENTS_URL}/ingest/authzero`,
    EVENT_WEBHOOK_SECRET: authzeroWebhookSecret,
  });
  upsertEnv(files.events, {
    AUTHZERO_WEBHOOK_SECRET: authzeroWebhookSecret,
    SECRETS_ENCRYPTION_KEY: secretsKey,
    DATABASE_URL: eventsEnv.DATABASE_URL || `${DB_BASE}/pleneo_events`,
    AUTH_ISSUER: AUTH_URL,
    INTERNAL_IDENTITY_KEY: identityKey,
    INTERNAL_IDENTITY_AUDIENCE: 'pleneo-events',
  });
  upsertEnv(files.backend, {
    EVENTS_URL,
    EVENTS_CLIENT_ID: client.client_id,
    EVENTS_CLIENT_SECRET: client.clientSecret,
    EVENTS_WEBHOOK_SECRET: managementWebhookSecret,
    OUTBOX_ENABLED: 'true',
    AUTH_ISSUER: AUTH_URL,
    AUTH_INTERNAL_URL: AUTH_URL,
    IOT_URL,
    BFF_ENABLED: 'true',
    BFF_SESSION_KEY: bffSessionKey,
    BFF_COOKIE_SECURE: 'false',
    INTERNAL_IDENTITY_KEY: identityKey,
  });
  upsertEnv(files.iot, {
    AUTH_ISSUER: AUTH_URL,
    DEVICE_SECRET_KEY: deviceSecretKey,
    DATABASE_URL: iotEnv.DATABASE_URL || `${DB_BASE}/pleneo_iot`,
    EVENTS_URL,
    EVENTS_CLIENT_ID: iotClient.client_id,
    EVENTS_CLIENT_SECRET: iotClient.clientSecret,
    OUTBOX_ENABLED: 'true',
    INTERNAL_IDENTITY_KEY: identityKey,
    INTERNAL_IDENTITY_AUDIENCE: 'pleneo-iot',
  });
  upsertEnv(files.frontend, { NEXT_PUBLIC_BFF_URL: API_URL });

  const eventsDir = path.join(root, 'pleneo-events');
  execFileSync('node', ['src/infrastructure/database/migrate.js'], { cwd: eventsDir, stdio: 'inherit' });
  execFileSync('node', ['src/infrastructure/database/migrate.js'], {
    cwd: path.join(root, 'pleneo-iot'),
    stdio: 'inherit',
  });
  execFileSync(
    'node',
    [
      'scripts/seed-subscription.js',
      'pleneo-management',
      `${API_URL}/webhooks/events`,
      'project.*,iot.*',
      managementWebhookSecret,
    ],
    {
      cwd: eventsDir,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );

  process.stdout.write(
    [
      '',
      'Connected:',
      `  authzero  -> ${EVENTS_URL}/ingest/authzero (signed outbox webhook)`,
      `  backend   -> ${EVENTS_URL} via client ${client.client_id} (outbox relay + email jobs)`,
      `  events    -> ${API_URL}/webhooks/events (subscription pleneo-management, project.* and iot.*)`,
      `  iot       -> ${EVENTS_URL} via client ${iotClient.client_id} (device, alert and lifecycle events)`,
      '',
      'Restart authzero, the management backend and pleneo-iot so they pick up the new .env values.',
      '',
    ].join('\n'),
  );
}

main().catch((err) => fail(err.message));
