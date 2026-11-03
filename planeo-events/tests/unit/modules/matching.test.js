import { describe, expect, it, vi } from 'vitest';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { matchesEventType, subscriptionsFor } = await import('#modules/events/event.service.js');
const { nextCronRun, isValidCron } = await import('#scheduler/cron.js');
const { renderTemplate, templateNames } = await import('#notifications/templates.js');

describe('event type matching', () => {
  it('supports exact, prefix wildcard and global wildcard patterns', () => {
    expect(matchesEventType('project.created', 'project.created')).toBe(true);
    expect(matchesEventType('project.*', 'project.created')).toBe(true);
    expect(matchesEventType('project.*', 'project.task.created')).toBe(true);
    expect(matchesEventType('project.*', 'projects.created')).toBe(false);
    expect(matchesEventType('*', 'anything.at.all')).toBe(true);
    expect(matchesEventType('project', 'project.created')).toBe(false);
  });

  it('selects subscriptions whose patterns match', () => {
    const subs = [
      { name: 'a', event_types: ['project.*'] },
      { name: 'b', event_types: ['auth.user.registered'] },
      { name: 'c', event_types: ['*'] },
    ];
    expect(subscriptionsFor(subs, 'project.created').map((s) => s.name)).toEqual(['a', 'c']);
    expect(subscriptionsFor(subs, 'auth.user.locked').map((s) => s.name)).toEqual(['c']);
  });
});

describe('cron', () => {
  it('computes the next run and validates expressions', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(nextCronRun('*/5 * * * *', { from }).toISOString()).toBe('2026-01-01T00:05:00.000Z');
    expect(nextCronRun('0 9 * * 1', { from, timezone: 'Asia/Manila' }).toISOString()).toBe('2026-01-05T01:00:00.000Z');
    expect(isValidCron('not a cron')).toBe(false);
    expect(() => nextCronRun('61 * * * *')).toThrow(expect.objectContaining({ code: 'INVALID_CRON' }));
  });
});

describe('email templates', () => {
  it('renders links from the app base url', () => {
    const email = renderTemplate('auth.verify-email', { verificationToken: 'tok-123', name: 'Ada' });
    expect(email.subject).toMatch(/verify/i);
    expect(email.text).toContain('http://localhost:3000/verify-email?token=tok-123');
    expect(email.html).toContain('href="http://localhost:3000/verify-email?token=tok-123"');
    expect(templateNames()).toContain('auth.reset-password');
  });

  it('rejects unknown templates as non-retryable', () => {
    expect(() => renderTemplate('nope', {})).toThrow(expect.objectContaining({ retryable: false }));
  });
});
