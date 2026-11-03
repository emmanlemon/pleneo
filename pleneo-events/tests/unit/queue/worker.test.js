import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_ID } from '../../helpers/principal.js';

vi.mock('#queue/job.repository.js');
vi.mock('#queue/handlers/index.js', () => {
  const handlers = new Map();
  return {
    registerHandler: (type, fn) => handlers.set(type, fn),
    hasHandler: (type) => handlers.has(type),
    getHandler: (type) => handlers.get(type),
    handlerTypes: () => [...handlers.keys()],
  };
});

const repo = await import('#queue/job.repository.js');
const { registerHandler } = await import('#queue/handlers/index.js');
const { createWorker } = await import('#queue/worker.js');
const { NonRetryableError } = await import('#common/errors/domain-errors.js');

const job = (overrides = {}) => ({
  id: JOB_ID,
  queue: 'default',
  type: 'test.job',
  payload: {},
  attempts: 1,
  max_attempts: 3,
  ...overrides,
});
const flush = () => new Promise((r) => setTimeout(r, 30));

async function runOnce(claimed) {
  repo.claim.mockResolvedValueOnce(claimed).mockResolvedValue([]);
  const worker = createWorker({
    queues: ['default'],
    concurrency: 2,
    pollIntervalMs: 5,
    jobTimeoutMs: 200,
    workerId: 'w1',
  });
  worker.start();
  await flush();
  await worker.stop({ drainTimeoutMs: 500 });
  return worker;
}

beforeEach(() => {
  repo.succeed.mockResolvedValue();
  repo.fail.mockResolvedValue('pending');
});

describe('worker', () => {
  it('runs the handler and marks success', async () => {
    const handler = vi.fn().mockResolvedValue();
    registerHandler('test.job', handler);
    await runOnce([job()]);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID }),
      expect.objectContaining({ logger: expect.anything() }),
    );
    expect(repo.succeed).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID }),
      expect.objectContaining({ workerId: 'w1' }),
    );
  });

  it('schedules a retry with backoff on failure', async () => {
    registerHandler('test.job', vi.fn().mockRejectedValue(new Error('boom')));
    await runOnce([job({ attempts: 1 })]);
    const [, outcome] = repo.fail.mock.calls[0];
    expect(outcome.error).toBe('boom');
    expect(outcome.retryAt).toBeInstanceOf(Date);
    expect(outcome.retryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters after the last attempt and on non-retryable errors', async () => {
    registerHandler('test.job', vi.fn().mockRejectedValue(new Error('boom')));
    await runOnce([job({ attempts: 3, max_attempts: 3 })]);
    expect(repo.fail.mock.calls[0][1].retryAt).toBeNull();

    registerHandler('test.job', vi.fn().mockRejectedValue(new NonRetryableError('bad payload')));
    await runOnce([job({ attempts: 1 })]);
    expect(repo.fail.mock.calls[1][1].retryAt).toBeNull();
  });

  it('treats a hung handler as a failure after the timeout', async () => {
    registerHandler('test.job', () => new Promise(() => {}));
    await runOnce([job()]);
    await flush();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ error: expect.stringMatching(/timed out/) }),
    );
  });

  it('claims only as many jobs as free slots', async () => {
    registerHandler('test.job', () => new Promise((r) => setTimeout(r, 50)));
    repo.claim.mockResolvedValueOnce([job({ id: 'a' }), job({ id: 'b' })]).mockResolvedValue([]);
    const worker = createWorker({ queues: ['default'], concurrency: 2, pollIntervalMs: 5, workerId: 'w1' });
    worker.start();
    await flush();
    expect(worker.inFlight).toBe(2);
    expect(repo.claim).toHaveBeenCalledWith(['default'], 2, 'w1');
    await worker.stop({ drainTimeoutMs: 500 });
    expect(worker.inFlight).toBe(0);
  });
});
