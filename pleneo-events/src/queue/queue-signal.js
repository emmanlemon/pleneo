import { randomUUID } from 'node:crypto';
import { config } from '#config';
import { decrypt, signPayload } from '#infra/security/crypto.js';
import { logger } from '#infra/logging/logger.js';
import * as subscriptions from '#modules/subscriptions/subscription.repository.js';

const TYPE = 'queue.changed';

// Copied rather than imported: the event service reaches back into the queue, and importing
// it here would close that loop.
const matches = (pattern) =>
  pattern === '*' || pattern === TYPE || (pattern.endsWith('.*') && TYPE.startsWith(pattern.slice(0, -1)));
const log = logger.child({ component: 'queue-signal' });

let dirty = false;
let timer = null;
let inFlight = false;

async function deliver(subscription, body, timestamp) {
  const res = await fetch(subscription.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'pleneo-events/1.0',
      'x-pleneo-event': TYPE,
      'x-pleneo-timestamp': timestamp,
      'x-pleneo-signature': signPayload(decrypt(subscription.secret_enc), timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(config.WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${subscription.name} answered ${res.status}`);
}

/**
 * Delivered directly rather than through the job queue: a queue change that enqueued a
 * delivery job would itself be a queue change, and the two would feed each other.
 */
async function flush() {
  if (inFlight || !dirty) return;
  inFlight = true;
  dirty = false;

  try {
    const active = await subscriptions.listActive();
    const interested = active.filter((s) => s.event_types.some(matches));
    if (!interested.length) return;

    // listActive deliberately withholds the secret, so load it only for the targets we sign for.
    const targets = (await Promise.all(interested.map((s) => subscriptions.findById(s.id)))).filter(
      (s) => s?.secret_enc,
    );
    if (!targets.length) return;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      id: randomUUID(),
      type: TYPE,
      source: 'pleneo-events',
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    await Promise.all(targets.map((s) => deliver(s, body, timestamp).catch((err) => log.warn({ err: err.message, subscription: s.name }, 'queue signal failed'))));
  } catch (err) {
    log.warn({ err: err.message }, 'queue signal flush failed');
  } finally {
    inFlight = false;
  }
}

export const markQueueDirty = () => {
  dirty = true;
};

export function startQueueSignals() {
  if (!config.QUEUE_SIGNAL_ENABLED || timer) return;
  timer = setInterval(() => void flush(), config.QUEUE_SIGNAL_INTERVAL_MS).unref();
}

export function stopQueueSignals() {
  clearInterval(timer);
  timer = null;
  dirty = false;
}

export const flushQueueSignal = flush;
