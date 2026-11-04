import { config } from '#config';

const split = (path) => path.split('/').filter(Boolean);

const route = (method, path, overrides = {}) => ({
  method,
  path,
  segments: split(path),
  timeoutMs: config.GATEWAY_TIMEOUT_MS,
  retries: method === 'GET' ? 2 : 0,
  ...overrides,
});

const eventsRoutes = [
  route('GET', '/queues/stats'),
  route('GET', '/queues/jobs'),
  route('GET', '/queues/events'),
  route('GET', '/queues/schedules'),
  route('GET', '/queues/subscriptions'),
  route('GET', '/queues/jobs/:id'),
  route('POST', '/queues/jobs/:id/retry'),
  route('POST', '/queues/jobs/:id/cancel'),
  route('PATCH', '/queues/schedules/:id'),
  route('POST', '/queues/schedules/:id/run'),
  route('PATCH', '/queues/subscriptions/:id'),
];

const accessRoutes = [
  route('GET', '/users'),
  route('POST', '/users'),
  route('GET', '/users/:id'),
  route('PATCH', '/users/:id'),
  route('POST', '/users/:id/unlock'),
  route('POST', '/users/:id/revoke-sessions'),
  route('POST', '/users/:id/invitations'),
  route('POST', '/users/:id/roles'),
  route('DELETE', '/users/:id/roles/:role'),
  route('GET', '/roles'),
  route('GET', '/clients'),
  route('POST', '/clients'),
  route('DELETE', '/clients/:id'),
  route('GET', '/audit'),
];

const iotRoutes = [
  route('GET', '/devices/stats'),
  route('GET', '/devices/types'),
  route('GET', '/devices'),
  route('POST', '/devices'),
  route('GET', '/devices/:id'),
  route('PATCH', '/devices/:id'),
  route('DELETE', '/devices/:id'),
  route('POST', '/devices/:id/credentials'),
  route('GET', '/devices/:id/simulation'),
  route('POST', '/devices/:id/simulation'),
  route('DELETE', '/devices/:id/simulation'),
  route('PUT', '/devices/:id/state/desired'),
  route('GET', '/devices/:id/latest'),
  route('GET', '/devices/:id/series', { timeoutMs: 15_000 }),
  route('GET', '/devices/:id/commands'),
  route('POST', '/devices/:id/commands'),
  route('POST', '/commands/:id/cancel'),
  route('GET', '/alerts/stats'),
  route('GET', '/alerts'),
  route('POST', '/alerts/:id/acknowledge'),
  route('POST', '/alerts/:id/resolve'),
  route('GET', '/rules'),
];

/**
 * `routes` and `mounts` are what the console sees, under `/v1`. Whether a path is served here
 * or proxied is not its business, so nothing in them names an upstream service. `rewrite` maps
 * a console path onto the upstream's own surface when the two differ. `bearer` upstreams verify
 * the user's own access token instead of a gateway identity assertion.
 */
export const UPSTREAMS = {
  access: {
    audience: 'authzero',
    baseUrl: () => config.AUTH_INTERNAL_URL,
    bearer: true,
    mounts: ['/users', '/roles', '/clients', '/audit'],
    rewrite: (path) => `/v1/admin${path}`,
    routes: accessRoutes,
  },
  events: {
    audience: 'pleneo-events',
    baseUrl: () => config.EVENTS_URL,
    mounts: ['/queues'],
    rewrite: (path) => `/v1/admin${path.slice('/queues'.length)}`,
    routes: eventsRoutes,
  },
  iot: {
    audience: 'pleneo-iot',
    baseUrl: () => config.IOT_URL,
    mounts: ['/devices', '/commands', '/alerts', '/rules'],
    rewrite: (path) => `/v1${path}`,
    routes: iotRoutes,
  },
};

const matches = (pattern, actual) =>
  pattern.length === actual.length && pattern.every((s, i) => s.startsWith(':') || s === actual[i]);

export function matchRoute(name, method, pathname) {
  const actual = split(pathname);
  return UPSTREAMS[name].routes.find((r) => r.method === method && matches(r.segments, actual)) ?? null;
}

export const upstreamPathFor = (name, consolePath) => UPSTREAMS[name].rewrite(consolePath);

export const routeCount = (name) => UPSTREAMS[name].routes.length;
