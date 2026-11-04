import { PLATFORM_ROLES } from '#modules/users/catalogue.js';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const SESSION_ID = '22222222-2222-4222-8222-222222222222';
export const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
export const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';

export const ADMIN_PERMISSIONS = [...PLATFORM_ROLES.admin];

export const principal = { current: null };

export const anonymous = () => (principal.current = null);

export const asUser = (overrides = {}) =>
  (principal.current = {
    type: 'user',
    userId: USER_ID,
    sessionId: SESSION_ID,
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
    amr: ['pwd'],
    scopes: [],
    jti: 'jti-user',
    ...overrides,
  });

export const asAdmin = (overrides = {}) =>
  asUser({ roles: ['admin', 'user'], permissions: ADMIN_PERMISSIONS, ...overrides });

export const asClient = (scopes = []) =>
  (principal.current = { type: 'client', clientId: CLIENT_ID, scopes, roles: [], permissions: scopes, jti: 'jti-client' });
