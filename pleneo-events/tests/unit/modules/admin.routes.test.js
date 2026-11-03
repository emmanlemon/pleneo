import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asAdmin, asClient, asUser, JOB_ID, SUBSCRIPTION_ID } from '../../helpers/principal.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/principal.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
    actorOf: (auth) => (auth.type === 'user' ? `user:${auth.userId}` : `client:${auth.clientId}`),
  };
});
vi.mock('#queue/queue.service.js');
vi.mock('#modules/admin/stats.repository.js');
vi.mock('#modules/subscriptions/subscription.repository.js');
vi.mock('#scheduler/schedule.repository.js');
vi.mock('#scheduler/scheduler.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const queue = await import('#queue/queue.service.js');
const stats = await import('#modules/admin/stats.repository.js');
const subscriptions = await import('#modules/subscriptions/subscription.repository.js');
const schedules = await import('#scheduler/schedule.repository.js');
const scheduler = await import('#scheduler/scheduler.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');
const { decrypt } = await import('#infra/security/crypto.js');

beforeEach(() => asAdmin());

describe('admin authorization', () => {
  it('allows admins and manage-scoped clients only', async () => {
    anonymous();
    expectProblem(await api().get('/admin/stats'), 401, 'AUTHENTICATION_REQUIRED');
    asUser();
    expectProblem(await api().get('/admin/stats'), 403, 'INSUFFICIENT_SCOPE');
    asClient(['events:publish']);
    expectProblem(await api().get('/admin/stats'), 403, 'INSUFFICIENT_SCOPE');
    asClient(['events:manage']);
    stats.overview.mockResolvedValue({ queues: {}, throughput: [], types: [] });
    expect((await api().get('/admin/stats')).status).toBe(200);
  });
});

describe('jobs administration', () => {
  it('lists with validated filters and exposes handler types in stats', async () => {
    queue.listJobs.mockResolvedValue([{ id: JOB_ID, created_at: '2026-01-01T00:00:00.000Z' }]);
    const res = await api().get('/admin/jobs?status=dead&queue=webhooks&limit=1');
    expect(res.body.nextBefore).toBe('2026-01-01T00:00:00.000Z');
    expect(queue.listJobs).toHaveBeenCalledWith({ status: 'dead', queue: 'webhooks', limit: 1 });
    expectProblem(await api().get('/admin/jobs?status=bogus'), 400, 'VALIDATION_FAILED');
    stats.overview.mockResolvedValue({ queues: {}, throughput: [], types: [] });
    expect((await api().get('/admin/stats')).body.handlerTypes).toContain('webhook.deliver');
  });

  it('retries and cancels through the service, mapping invalid transitions', async () => {
    queue.retryJob.mockResolvedValue({ id: JOB_ID, status: 'pending' });
    expect((await api().post(`/admin/jobs/${JOB_ID}/retry`)).body.status).toBe('pending');
    queue.cancelJob.mockRejectedValue(DomainErrors.invalidTransition('succeeded', 'cancelled'));
    expectProblem(await api().post(`/admin/jobs/${JOB_ID}/cancel`), 409, 'INVALID_JOB_TRANSITION');
    queue.getJob.mockRejectedValue(DomainErrors.notFound('Job'));
    expectProblem(await api().get(`/admin/jobs/${JOB_ID}`), 404, 'NOT_FOUND');
  });
});

describe('subscriptions administration', () => {
  it('creates a subscription with an encrypted generated secret returned once', async () => {
    subscriptions.create.mockImplementation(async (input) => ({
      id: SUBSCRIPTION_ID,
      name: input.name,
      url: input.url,
      event_types: input.eventTypes,
      status: 'active',
    }));
    const res = await api()
      .post('/admin/subscriptions')
      .send({ name: 'pleneo-management', url: 'https://api.example.com/webhooks/events', eventTypes: ['project.*'] });
    expect(res.status).toBe(201);
    expect(res.body.secret).toHaveLength(64);
    expect(decrypt(subscriptions.create.mock.calls[0][0].secretEnc)).toBe(res.body.secret);
  });

  it('validates event type patterns and names', async () => {
    expectProblem(
      await api()
        .post('/admin/subscriptions')
        .send({ name: 'Bad Name', url: 'https://x.io', eventTypes: ['project.*'] }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(
      await api()
        .post('/admin/subscriptions')
        .send({ name: 'ok', url: 'https://x.io', eventTypes: ['*.created'] }),
      400,
      'VALIDATION_FAILED',
    );
  });
});

describe('schedules administration', () => {
  it('creates a schedule with a computed next run and rejects unknown job types or bad cron', async () => {
    schedules.create.mockImplementation(async (input) => ({ id: SUBSCRIPTION_ID, ...input }));
    const res = await api()
      .post('/admin/schedules')
      .send({ name: 'nightly.maintenance', cron: '0 2 * * *', jobType: 'queue.maintenance', queue: 'system' });
    expect(res.status).toBe(201);
    expect(new Date(schedules.create.mock.calls[0][0].nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expectProblem(
      await api().post('/admin/schedules').send({ name: 'x.y', cron: '0 2 * * *', jobType: 'nope.job' }),
      400,
      'UNKNOWN_JOB_TYPE',
    );
    expectProblem(
      await api().post('/admin/schedules').send({ name: 'x.y', cron: 'every day', jobType: 'queue.maintenance' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('triggers a schedule immediately', async () => {
    schedules.findById.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      name: 'queue.maintenance',
      job_type: 'queue.maintenance',
      queue: 'system',
      payload: {},
    });
    scheduler.triggerSchedule.mockResolvedValue({ id: JOB_ID });
    const res = await api().post(`/admin/schedules/${SUBSCRIPTION_ID}/run`);
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe(JOB_ID);
  });
});
