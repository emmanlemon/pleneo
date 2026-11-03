import { config } from '#config';
import { NonRetryableError } from '#common/errors/domain-errors.js';
import { decrypt, signPayload } from '#infra/security/crypto.js';
import * as events from '#modules/events/event.repository.js';
import * as subscriptions from '#modules/subscriptions/subscription.repository.js';

const RETRYABLE_STATUSES = new Set([408, 425, 429]);

export async function webhookDeliverHandler(job, { logger }) {
  const [subscription, event] = await Promise.all([
    subscriptions.findById(job.payload.subscriptionId),
    events.findById(job.payload.eventId),
  ]);
  if (!subscription || !event) throw new NonRetryableError('subscription or event no longer exists');
  if (subscription.status !== 'active')
    throw new NonRetryableError(`subscription ${subscription.name} is ${subscription.status}`);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    source: event.source,
    occurredAt: event.occurred_at,
    payload: event.payload,
  });
  const res = await fetch(subscription.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'pleneo-events/1.0',
      'x-pleneo-event': event.type,
      'x-pleneo-event-id': event.id,
      'x-pleneo-delivery': job.id,
      'x-pleneo-attempt': String(job.attempts),
      'x-pleneo-timestamp': timestamp,
      'x-pleneo-signature': signPayload(decrypt(subscription.secret_enc), timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(config.WEBHOOK_TIMEOUT_MS),
  });

  if (res.ok) return;
  if (res.status === 410) {
    await subscriptions.setStatus(subscription.id, 'paused');
    throw new NonRetryableError('endpoint returned 410 Gone, subscription paused');
  }
  const message = `endpoint responded ${res.status}`;
  if (res.status >= 400 && res.status < 500 && !RETRYABLE_STATUSES.has(res.status))
    throw new NonRetryableError(message);
  logger.warn({ status: res.status, subscription: subscription.name }, 'webhook delivery failed, will retry');
  throw new Error(message);
}
