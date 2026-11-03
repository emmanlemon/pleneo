import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { enqueue } from '#queue/queue.service.js';
import * as subscriptions from '#modules/subscriptions/subscription.repository.js';
import * as events from './event.repository.js';
import { runInternalHandlers } from './internal-handlers.js';

export function matchesEventType(pattern, type) {
  if (pattern === '*' || pattern === type) return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return false;
}

export const subscriptionsFor = (list, type) =>
  list.filter((s) => s.event_types.some((pattern) => matchesEventType(pattern, type)));

export async function publish({ type, payload = {}, source, idempotencyKey, correlationId, occurredAt, createdBy }) {
  return withTransaction(async (client) => {
    const event = await events.insert({ type, source, payload, idempotencyKey, correlationId, occurredAt }, client);
    if (!event)
      return { event: await events.findByIdempotencyKey(idempotencyKey, client), duplicate: true, deliveries: 0 };

    const targets = subscriptionsFor(await subscriptions.listActive(client), type);
    for (const subscription of targets) {
      await enqueue(
        {
          queue: 'webhooks',
          type: 'webhook.deliver',
          payload: { subscriptionId: subscription.id, eventId: event.id },
          eventId: event.id,
          subscriptionId: subscription.id,
          idempotencyKey: `deliver:${event.id}:${subscription.id}`,
          createdBy,
        },
        client,
      );
    }
    const internal = await runInternalHandlers(event, client);
    logger.info({ eventId: event.id, type, deliveries: targets.length, internal }, 'event published');
    return { event, duplicate: false, deliveries: targets.length, internal };
  });
}

export const listEvents = (filters) => events.list(filters);

export async function getEvent(id) {
  const event = await events.findById(id);
  return event ? { ...event, deliveries: await events.deliveriesFor(id) } : null;
}
