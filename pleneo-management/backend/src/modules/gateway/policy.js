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
  route('GET', '/admin/stats'),
  route('GET', '/admin/jobs'),
  route('GET', '/admin/events'),
  route('GET', '/admin/schedules'),
  route('GET', '/admin/subscriptions'),
  route('GET', '/admin/jobs/:id'),
  route('POST', '/admin/jobs/:id/retry'),
  route('POST', '/admin/jobs/:id/cancel'),
  route('PATCH', '/admin/schedules/:id'),
  route('POST', '/admin/schedules/:id/run'),
  route('PATCH', '/admin/subscriptions/:id'),
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
 * `routes` are console-facing paths, the part after `/v1/bff/<name>`. `apiPrefix` is the
 * upstream's own API version, added when the target URL is built, so the console's paths
 * stay stable when an upstream version moves.
 */
export const UPSTREAMS = {
  events: { audience: 'pleneo-events', baseUrl: () => config.EVENTS_URL, apiPrefix: '/v1', routes: eventsRoutes },
  iot: { audience: 'pleneo-iot', baseUrl: () => config.IOT_URL, apiPrefix: '/v1', routes: iotRoutes },
};

const matches = (pattern, actual) =>
  pattern.length === actual.length && pattern.every((s, i) => s.startsWith(':') || s === actual[i]);

export function matchRoute(name, method, pathname) {
  const actual = split(pathname);
  return UPSTREAMS[name].routes.find((r) => r.method === method && matches(r.segments, actual)) ?? null;
}

export const routeCount = (name) => UPSTREAMS[name].routes.length;
