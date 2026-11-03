import { describe, expect, it } from 'vitest';
import { UPSTREAMS, matchRoute } from '#modules/gateway/policy.js';

describe('route allowlist', () => {
  it('matches literal segments before parameters', () => {
    expect(matchRoute('iot', 'GET', '/devices/stats').path).toBe('/devices/stats');
    expect(matchRoute('iot', 'GET', '/devices/types').path).toBe('/devices/types');
    expect(matchRoute('iot', 'GET', '/devices/abc-123').path).toBe('/devices/:id');
    expect(matchRoute('iot', 'GET', '/alerts/stats').path).toBe('/alerts/stats');
  });

  it('matches on method, not path alone', () => {
    expect(matchRoute('iot', 'POST', '/devices')).not.toBeNull();
    expect(matchRoute('iot', 'PUT', '/devices')).toBeNull();
    expect(matchRoute('events', 'DELETE', '/admin/jobs/abc')).toBeNull();
  });

  it('refuses the upstream surfaces the console has no business reaching', () => {
    expect(matchRoute('iot', 'POST', '/v1/device/telemetry')).toBeNull();
    expect(matchRoute('iot', 'POST', '/v1/device/state')).toBeNull();
    expect(matchRoute('events', 'POST', '/events')).toBeNull();
    expect(matchRoute('events', 'POST', '/jobs')).toBeNull();
    expect(matchRoute('events', 'POST', '/ingest/authzero')).toBeNull();
    expect(matchRoute('events', 'GET', '/health')).toBeNull();
  });

  it('does not let a deeper path slip through a shorter pattern', () => {
    expect(matchRoute('iot', 'GET', '/devices/abc/secrets')).toBeNull();
    expect(matchRoute('events', 'GET', '/admin/jobs/abc/attempts')).toBeNull();
  });

  it('gives reads retries and writes none', () => {
    expect(matchRoute('events', 'GET', '/admin/stats').retries).toBeGreaterThan(0);
    expect(matchRoute('events', 'POST', '/admin/jobs/abc/retry').retries).toBe(0);
    expect(matchRoute('iot', 'DELETE', '/devices/abc').retries).toBe(0);
  });

  it('binds each upstream to its own audience', () => {
    expect(UPSTREAMS.events.audience).toBe('planeo-events');
    expect(UPSTREAMS.iot.audience).toBe('planeo-iot');
  });
});

const CONSOLE_SURFACE = {
  events: [
    'GET /admin/stats',
    'GET /admin/jobs',
    'GET /admin/jobs/:id',
    'POST /admin/jobs/:id/retry',
    'POST /admin/jobs/:id/cancel',
    'GET /admin/events',
    'GET /admin/schedules',
    'PATCH /admin/schedules/:id',
    'POST /admin/schedules/:id/run',
    'GET /admin/subscriptions',
    'PATCH /admin/subscriptions/:id',
  ],
  iot: [
    'GET /devices',
    'GET /devices/stats',
    'GET /devices/types',
    'GET /devices/:id',
    'POST /devices',
    'PATCH /devices/:id',
    'DELETE /devices/:id',
    'POST /devices/:id/credentials',
    'PUT /devices/:id/state/desired',
    'GET /devices/:id/latest',
    'GET /devices/:id/series',
    'GET /devices/:id/commands',
    'POST /devices/:id/commands',
    'POST /commands/:id/cancel',
    'GET /alerts',
    'GET /alerts/stats',
    'POST /alerts/:id/acknowledge',
    'POST /alerts/:id/resolve',
    'GET /rules',
  ],
};

describe('allowlist matches the console surface', () => {
  for (const [name, expected] of Object.entries(CONSOLE_SURFACE)) {
    it(`covers ${name} exactly, with nothing spare`, () => {
      const declared = UPSTREAMS[name].routes.map((r) => `${r.method} ${r.path}`);
      expect([...declared].sort()).toEqual([...expected].sort());
    });
  }
});
