import { query } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { hasHandler } from './handlers/index.js';
import * as jobs from './job.repository.js';

export async function enqueue(
  {
    queue = 'default',
    type,
    payload = {},
    runAt = null,
    priority = 0,
    maxAttempts = 8,
    idempotencyKey,
    eventId,
    subscriptionId,
    scheduleId,
    createdBy,
  },
  client = { query },
) {
  if (!hasHandler(type)) throw DomainErrors.unknownJobType(type);
  const job = await jobs.insert(
    {
      queue,
      type,
      payload,
      runAt,
      priority,
      maxAttempts,
      idempotencyKey,
      eventId,
      subscriptionId,
      scheduleId,
      createdBy,
    },
    client,
  );
  if (job) return { job, duplicate: false };
  return { job: await jobs.findByIdempotencyKey(idempotencyKey, client), duplicate: true };
}

export async function retryJob(id) {
  const current = await jobs.findById(id);
  if (!current) throw DomainErrors.notFound('Job');
  const job = await jobs.retry(id);
  if (!job) throw DomainErrors.invalidTransition(current.status, 'pending');
  return job;
}

export async function cancelJob(id) {
  const current = await jobs.findById(id);
  if (!current) throw DomainErrors.notFound('Job');
  const job = await jobs.cancel(id);
  if (!job) throw DomainErrors.invalidTransition(current.status, 'cancelled');
  return job;
}

export async function getJob(id) {
  const job = await jobs.findById(id);
  if (!job) throw DomainErrors.notFound('Job');
  return { ...job, attempts_log: await jobs.attemptsFor(id) };
}

export const listJobs = (filters) => jobs.list(filters);
