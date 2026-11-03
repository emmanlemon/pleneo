import { authenticator } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.E2E_BASE_URL;
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n-Str0ng-Passw0rd!',
};

async function call(method, path, { body, token, headers = {}, form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(form
        ? { 'content-type': 'application/x-www-form-urlencoded' }
        : body
          ? { 'content-type': 'application/json' }
          : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

describe.skipIf(!BASE)('authentication flow against a running instance', () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const stamp = Date.now();
  const user = { email: `e2e${stamp}@example.com`, password: `E2e-Passw0rd-${stamp}` };
  let admin;
  let tokens;

  beforeAll(async () => {
    admin = (await call('POST', '/auth/login', { body: ADMIN })).body;
    expect(admin.accessToken).toBeDefined();
  });
  afterAll(() => db.end());

  it('registers, verifies by outbox token and logs in', async () => {
    expect((await call('POST', '/auth/register', { body: user })).status).toBe(202);
    expect((await call('POST', '/auth/register', { body: user })).status).toBe(202);
    expect((await call('POST', '/auth/login', { body: user })).body.code).toBe('EMAIL_UNVERIFIED');

    const { rows } = await db.query(
      `SELECT payload->>'verificationToken' AS token FROM outbox_events WHERE type = 'user.registered' AND payload->>'email' = $1 ORDER BY id DESC LIMIT 1`,
      [user.email],
    );
    expect((await call('POST', '/auth/email/verify', { body: { token: rows[0].token } })).status).toBe(200);
    expect((await call('POST', '/auth/email/verify', { body: { token: rows[0].token } })).status).toBe(401);

    const login = await call('POST', '/auth/login', { body: user });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/);
    tokens = login.body;
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const second = (await call('POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).body;
    expect(second.refreshToken).not.toBe(tokens.refreshToken);
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).body.code).toBe(
      'REFRESH_TOKEN_REUSE',
    );
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: second.refreshToken } })).status).toBe(401);
    expect((await call('GET', '/users/me', { token: second.accessToken })).status).toBe(401);
  });

  it('locks after repeated failures and an admin can unlock', async () => {
    for (let i = 0; i < 5; i++)
      await call('POST', '/auth/login', { body: { email: user.email, password: 'Wrong-Password-1' } });
    expect((await call('POST', '/auth/login', { body: user })).status).toBe(423);
    const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [user.email]);
    expect((await call('POST', `/admin/users/${rows[0].id}/unlock`, { token: admin.accessToken })).status).toBe(204);
    tokens = (await call('POST', '/auth/login', { body: user })).body;
    expect(tokens.accessToken).toBeDefined();
  });

  it('enforces MFA as a second step with TOTP and recovery codes', async () => {
    const { secret } = (await call('POST', '/auth/mfa/setup', { token: tokens.accessToken })).body;
    const { recoveryCodes } = (
      await call('POST', '/auth/mfa/enable', {
        token: tokens.accessToken,
        body: { code: authenticator.generate(secret) },
      })
    ).body;
    expect(recoveryCodes).toHaveLength(10);

    let challenge = (await call('POST', '/auth/login', { body: user })).body;
    expect(challenge.mfaRequired).toBe(true);
    expect(
      (await call('POST', '/auth/login/mfa', { body: { mfaToken: challenge.mfaToken, code: '000000' } })).status,
    ).toBe(401);
    tokens = (
      await call('POST', '/auth/login/mfa', {
        body: { mfaToken: challenge.mfaToken, code: authenticator.generate(secret) },
      })
    ).body;
    expect(tokens.accessToken).toBeDefined();

    challenge = (await call('POST', '/auth/login', { body: user })).body;
    expect(
      (await call('POST', '/auth/login/mfa', { body: { mfaToken: challenge.mfaToken, code: recoveryCodes[0] } }))
        .status,
    ).toBe(200);
    challenge = (await call('POST', '/auth/login', { body: user })).body;
    expect(
      (await call('POST', '/auth/login/mfa', { body: { mfaToken: challenge.mfaToken, code: recoveryCodes[0] } }))
        .status,
    ).toBe(401);
  });

  it('issues scoped client credentials and introspects tokens', async () => {
    const client = (
      await call('POST', '/admin/clients', {
        token: admin.accessToken,
        body: { name: `e2e-${stamp}`, scopes: ['billing:read'] },
      })
    ).body;
    const basic = Buffer.from(`${client.client_id}:${client.clientSecret}`).toString('base64');
    const grant = await call('POST', '/oauth/token', {
      form: { grant_type: 'client_credentials', scope: 'billing:read' },
      headers: { authorization: `Basic ${basic}` },
    });
    expect(grant.status).toBe(200);
    expect(
      (
        await call('POST', '/oauth/token', {
          form: { grant_type: 'client_credentials', scope: 'admin' },
          headers: { authorization: `Basic ${basic}` },
        })
      ).status,
    ).toBe(403);

    const creds = { client_id: client.client_id, client_secret: client.clientSecret };
    expect(
      (await call('POST', '/oauth/introspect', { body: { token: tokens.accessToken, ...creds } })).body.active,
    ).toBe(true);
    expect((await call('POST', '/auth/logout', { token: tokens.accessToken })).status).toBe(204);
    expect(
      (await call('POST', '/oauth/introspect', { body: { token: tokens.accessToken, ...creds } })).body.active,
    ).toBe(false);
    expect((await call('GET', '/admin/users', { token: grant.body.access_token })).status).toBe(403);
  });

  it('rotates signing keys without invalidating existing tokens', async () => {
    expect((await call('POST', '/admin/keys/rotate', { token: admin.accessToken })).status).toBe(201);
    expect((await call('GET', '/.well-known/jwks.json')).body.keys.length).toBeGreaterThanOrEqual(2);
    expect((await call('GET', '/users/me', { token: admin.accessToken })).status).toBe(200);
  });
});
