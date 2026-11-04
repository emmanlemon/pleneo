import { describe, expect, it } from 'vitest';
import { requireMfa, requirePermission, requireUser } from '#common/middleware/authorize.js';

const run = (middleware, auth) => new Promise((resolve) => middleware({ auth }, {}, resolve));
const user = (extra = {}) => ({ type: 'user', roles: ['user'], permissions: ['users:read'], amr: ['pwd'], ...extra });
const client = (scopes) => ({ type: 'client', roles: [], permissions: scopes, scopes });

describe('authorize', () => {
  it('requireUser accepts users only', async () => {
    expect(await run(requireUser, user())).toBeUndefined();
    expect((await run(requireUser, client([]))).code).toBe('USER_TOKEN_REQUIRED');
    expect((await run(requireUser, undefined)).code).toBe('USER_TOKEN_REQUIRED');
  });

  it('requirePermission demands every listed permission from users and clients alike', async () => {
    expect(await run(requirePermission('users:read'), user())).toBeUndefined();
    expect(await run(requirePermission('users:read'), client(['users:read']))).toBeUndefined();
    expect((await run(requirePermission('users:read', 'users:write'), user())).code).toBe('INSUFFICIENT_PERMISSIONS');
    expect((await run(requirePermission('users:write'), client(['users:read']))).code).toBe('INSUFFICIENT_SCOPE');
  });

  it('requireMfa needs an otp authentication method reference', async () => {
    expect(await run(requireMfa, user({ amr: ['pwd', 'otp'] }))).toBeUndefined();
    expect((await run(requireMfa, user())).code).toBe('MFA_STEP_UP_REQUIRED');
  });
});
