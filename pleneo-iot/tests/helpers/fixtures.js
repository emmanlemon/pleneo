export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
export const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
export const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
export const DEVICE_TYPE_ID = '55555555-5555-4555-8555-555555555555';
export const COMMAND_ID = '66666666-6666-4666-8666-666666666666';
export const ALERT_ID = '77777777-7777-4777-8777-777777777777';
export const RULE_ID = '88888888-8888-4888-8888-888888888888';
export const PROJECT_ID = '99999999-9999-4999-8999-999999999999';

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
export const ADMIN_PERMISSIONS = ['devices:read', 'devices:write', 'devices:manage', 'rules:manage', 'alerts:read'];

export const asAdmin = () => asUser({ roles: ['admin', 'user'], permissions: ADMIN_PERMISSIONS });
export const asClient = (scopes = []) =>
  (principal.current = { type: 'client', clientId: CLIENT_ID, scopes, roles: [], permissions: scopes, jti: 'jc' });

export const device = (overrides = {}) => ({
  id: DEVICE_ID,
  external_id: 'sensor-001',
  name: 'Cold room sensor',
  device_type_id: DEVICE_TYPE_ID,
  project_id: PROJECT_ID,
  owner_id: USER_ID,
  status: 'active',
  connection_status: 'online',
  device_type_key: 'environment-sensor',
  device_type_metrics: [
    { key: 'temperature', unit: 'C' },
    { key: 'humidity', unit: '%' },
  ],
  ...overrides,
});

export const rule = (overrides = {}) => ({
  id: RULE_ID,
  name: 'Cold room too warm',
  device_type_id: DEVICE_TYPE_ID,
  device_id: null,
  metric: 'temperature',
  operator: 'gt',
  threshold: 8,
  severity: 'critical',
  cooldown_seconds: 300,
  enabled: true,
  ...overrides,
});
