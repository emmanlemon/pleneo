export const PERMISSIONS = Object.freeze([
  'users:read',
  'users:write',
  'roles:manage',
  'clients:manage',
  'keys:rotate',
  'audit:read',
  'platform:manage',
  'projects:read',
  'projects:write',
  'devices:read',
  'devices:write',
  'devices:manage',
  'rules:manage',
  'alerts:read',
  'events:publish',
  'jobs:enqueue',
  'queues:manage',
]);

export const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' });

export const PLATFORM_ROLES = Object.freeze({
  [ROLES.ADMIN]: PERMISSIONS,
  [ROLES.USER]: Object.freeze([]),
});

export const isPermission = (value) => PERMISSIONS.includes(value);
