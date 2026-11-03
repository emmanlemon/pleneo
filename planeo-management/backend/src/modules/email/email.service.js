import { randomUUID } from 'node:crypto';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { logger } from '#infra/logging/logger.js';
import { EventsClientError, enqueueJob } from '#infra/messaging/events-client.js';

export async function sendTestEmail(auth, { to, note }) {
  const queuedAt = new Date().toISOString();
  const data = { requestedBy: auth.email, sentAt: queuedAt, ...(note ? { note } : {}) };

  try {
    const job = await enqueueJob({
      type: 'email.send',
      queue: 'email',
      payload: { to, template: 'system.test-email', data },
      idempotencyKey: `email-test:${randomUUID()}`,
    });
    logger.info({ to, jobId: job.jobId, requestedBy: auth.userId }, 'test email queued');
    return { jobId: job.jobId, status: job.status, to, queuedAt };
  } catch (err) {
    if (err instanceof EventsClientError) throw DomainErrors.upstreamUnavailable('planeo-events');
    throw err;
  }
}
