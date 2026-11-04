import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asAdmin, asClient, asUser, EVENT_ID, JOB_ID } from '../../helpers/principal.js';

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
vi.mock('#modules/events/event.service.js');
vi.mock('#queue/queue.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const events = await import('#modules/events/event.service.js');
const queue = await import('#queue/queue.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

beforeEach(() => {
  anonymous();
  events.publish.mockResolvedValue({ event: { id: EVENT_ID }, duplicate: false, deliveries: 2, internal: [] });
  queue.enqueue.mockResolvedValue({
    job: { id: JOB_ID, status: 'pending', run_at: new Date().toISOString() },
    duplicate: false,
  });
});

describe('POST /events', () => {
  it('requires the publish scope or an admin user', async () => {
    expectProblem(await api().post('/v1/events').send({ type: 'project.created' }), 401, 'AUTHENTICATION_REQUIRED');
    asClient(['jobs:enqueue']);
    expectProblem(await api().post('/v1/events').send({ type: 'project.created' }), 403, 'INSUFFICIENT_SCOPE');
    asUser();
    expectProblem(await api().post('/v1/events').send({ type: 'project.created' }), 403, 'INSUFFICIENT_PERMISSIONS');
  });

  it('publishes with the caller as source and reports fan-out', async () => {
    asClient(['events:publish']);
    const res = await api()
      .post('/v1/events')
      .send({ type: 'project.created', payload: { projectId: 'p1' }, idempotencyKey: 'k1' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ eventId: EVENT_ID, deliveries: 2, duplicate: false });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project.created',
        payload: { projectId: 'p1' },
        idempotencyKey: 'k1',
        source: expect.stringMatching(/^client:/),
      }),
    );
  });

  it('returns 200 on idempotent replays and validates type format', async () => {
    asAdmin();
    events.publish.mockResolvedValue({ event: { id: EVENT_ID }, duplicate: true, deliveries: 0 });
    expect((await api().post('/v1/events').send({ type: 'project.created' })).status).toBe(200);
    expectProblem(await api().post('/v1/events').send({ type: 'ProjectCreated' }), 400, 'VALIDATION_FAILED');
    expectProblem(await api().post('/v1/events').send({ type: 'project.created', extra: 1 }), 400, 'VALIDATION_FAILED');
  });
});

describe('POST /jobs', () => {
  it('enqueues for scoped clients and surfaces unknown job types', async () => {
    asClient(['jobs:enqueue']);
    const res = await api()
      .post('/v1/jobs')
      .send({ type: 'email.send', queue: 'email', payload: { to: 'a@b.co' }, runAt: '2030-01-01T00:00:00Z' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe(JOB_ID);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email.send',
        queue: 'email',
        runAt: '2030-01-01T00:00:00Z',
        priority: 0,
        maxAttempts: 8,
      }),
    );
    queue.enqueue.mockRejectedValue(DomainErrors.unknownJobType('nope.job'));
    expectProblem(await api().post('/v1/jobs').send({ type: 'nope.job' }), 400, 'UNKNOWN_JOB_TYPE');
  });

  it('rejects unscoped clients', async () => {
    asClient(['events:publish']);
    expectProblem(await api().post('/v1/jobs').send({ type: 'email.send' }), 403, 'INSUFFICIENT_SCOPE');
  });
});
