import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asAdmin, asUser } from '../../helpers/principal.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/principal.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
  };
});
vi.mock('#infra/messaging/events-client.js', async () => {
  const actual = await vi.importActual('#infra/messaging/events-client.js');
  return { ...actual, enqueueJob: vi.fn() };
});

const { api, expectProblem } = await import('../../helpers/app.js');
const { enqueueJob, EventsClientError } = await import('#infra/messaging/events-client.js');

beforeEach(() => {
  asAdmin();
  enqueueJob.mockResolvedValue({ jobId: 'job-1', status: 'pending', duplicate: false });
});

describe('POST /admin/email/test', () => {
  it('queues the test through the same pipeline a real notification uses', async () => {
    const res = await api().post('/admin/email/test').send({ to: 'Ops@Example.com ', note: 'mailtrap check' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ jobId: 'job-1', to: 'ops@example.com' });

    const [job] = enqueueJob.mock.calls[0];
    expect(job).toMatchObject({ type: 'email.send', queue: 'email' });
    expect(job.payload).toMatchObject({
      to: 'ops@example.com',
      template: 'system.test-email',
      data: { requestedBy: 'user@example.com', note: 'mailtrap check' },
    });
    expect(job.idempotencyKey).toMatch(/^email-test:/);
  });

  it('gives every send its own idempotency key so a retry is a real second send', async () => {
    await api().post('/admin/email/test').send({ to: 'ops@example.com' });
    await api().post('/admin/email/test').send({ to: 'ops@example.com' });
    const [first] = enqueueJob.mock.calls[0];
    const [second] = enqueueJob.mock.calls[1];
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('is admin only', async () => {
    asUser();
    expectProblem(await api().post('/admin/email/test').send({ to: 'ops@example.com' }), 403, 'INSUFFICIENT_PERMISSIONS');

    anonymous();
    expectProblem(await api().post('/admin/email/test').send({ to: 'ops@example.com' }), 401, 'AUTHENTICATION_REQUIRED');
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('validates the recipient and rejects unknown fields', async () => {
    expectProblem(await api().post('/admin/email/test').send({ to: 'not-an-email' }), 400, 'VALIDATION_FAILED');
    expectProblem(
      await api().post('/admin/email/test').send({ to: 'ops@example.com', provider: 'mailtrap' }),
      400,
      'VALIDATION_FAILED',
    );
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('reports the events service being down as an upstream problem', async () => {
    enqueueJob.mockRejectedValue(new EventsClientError('events service responded 502', 502));
    const res = await api().post('/admin/email/test').send({ to: 'ops@example.com' });
    expectProblem(res, 503, 'UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('events.test');
  });
});
