import { config } from '#config';
import { logger } from '#infra/logging/logger.js';
import { nextRunAt } from './backoff.js';
import { getHandler } from './handlers/index.js';
import * as jobs from './job.repository.js';

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`job timed out after ${ms}ms`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export function createWorker({
  queues = config.WORKER_QUEUES,
  concurrency = config.WORKER_CONCURRENCY,
  pollIntervalMs = config.WORKER_POLL_INTERVAL_MS,
  jobTimeoutMs = config.JOB_TIMEOUT_MS,
  workerId = config.WORKER_ID,
} = {}) {
  let running = false;
  let inFlight = 0;
  let timer = null;
  const log = logger.child({ component: 'worker', workerId });

  async function execute(job) {
    inFlight++;
    const started = Date.now();
    const jobLog = log.child({ jobId: job.id, type: job.type, queue: job.queue, attempt: job.attempts });
    try {
      await withTimeout(getHandler(job.type)(job, { logger: jobLog }), jobTimeoutMs);
      await jobs.succeed(job, { durationMs: Date.now() - started, workerId });
      jobLog.info({ durationMs: Date.now() - started }, 'job succeeded');
    } catch (err) {
      const retryable = err?.retryable !== false && job.attempts < job.max_attempts;
      const status = await jobs.fail(job, {
        error: String(err?.message ?? err).slice(0, 2000),
        retryAt: retryable ? nextRunAt(job.attempts) : null,
        durationMs: Date.now() - started,
        workerId,
      });
      jobLog[status === 'dead' ? 'error' : 'warn']({ err: err?.message, status }, 'job failed');
    } finally {
      inFlight--;
    }
  }

  async function poll() {
    if (!running) return;
    try {
      const slots = concurrency - inFlight;
      if (slots > 0) {
        const claimed = await jobs.claim(queues, slots, workerId);
        claimed.forEach(execute);
        if (claimed.length === slots) {
          timer = setTimeout(poll, 0);
          return;
        }
      }
    } catch (err) {
      log.error({ err }, 'poll failed');
    }
    timer = setTimeout(poll, pollIntervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      log.info({ queues, concurrency }, 'worker started');
      poll();
    },
    async stop({ drainTimeoutMs = 15_000 } = {}) {
      running = false;
      clearTimeout(timer);
      const deadline = Date.now() + drainTimeoutMs;
      while (inFlight > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      log.info({ abandoned: inFlight }, 'worker stopped');
    },
    get inFlight() {
      return inFlight;
    },
  };
}
