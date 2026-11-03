export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
export const JOB_ID = '44444444-4444-4444-8444-444444444444';
export const EVENT_ID = '55555555-5555-4555-8555-555555555555';
export const SUBSCRIPTION_ID = '66666666-6666-4666-8666-666666666666';

export const principal = { current: null };

export const anonymous = () => (principal.current = null);
export const asUser = (overrides = {}) =>
  (principal.current = {
    type: 'user',
    userId: USER_ID,
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
    scopes: [],
    jti: 'j',
    ...overrides,
  });
export const asAdmin = () => asUser({ roles: ['admin', 'user'] });
export const asClient = (scopes = []) =>
  (principal.current = { type: 'client', clientId: CLIENT_ID, scopes, roles: [], permissions: [], jti: 'jc' });
