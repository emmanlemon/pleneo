import { z } from 'zod';
import { config } from '#config';
import { ValidationError } from '#common/errors/app-error.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { verifySignedPayload } from '#common/security/signature.js';
import { formatZodIssues } from '#common/validation/validator.js';
import { withTransaction } from '#infra/database/pool.js';
import { emitToUser } from '#infra/realtime/socket-server.js';
import { handleEvent } from './event-handlers.js';

const envelope = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(120),
  source: z.string().max(120).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function receiveEvent(req, res) {
  if (!config.EVENTS_WEBHOOK_SECRET) throw DomainErrors.webhooksNotConfigured();
  const verdict = verifySignedPayload({
    secret: config.EVENTS_WEBHOOK_SECRET,
    timestamp: req.get('x-pleneo-timestamp'),
    body: req.rawBody?.toString('utf8') ?? '',
    signature: req.get('x-pleneo-signature'),
  });
  if (!verdict.ok) throw verdict.reason === 'stale' ? DomainErrors.staleSignature() : DomainErrors.invalidSignature();

  const parsed = envelope.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(formatZodIssues(parsed.error.issues, 'body'));
  const event = parsed.data;

  const outcome = await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `INSERT INTO processed_webhooks (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [event.id, event.type],
    );
    if (!rowCount) return 'duplicate';
    return (await handleEvent(event, client)) ? 'handled' : 'ignored';
  });

  if (outcome !== 'duplicate') {
    emitToUser(event.payload.ownerId, 'event:received', {
      type: event.type,
      eventId: event.id,
      deviceId: event.payload.deviceId,
      projectId: event.payload.projectId,
      occurredAt: event.occurredAt,
    });
  }

  req.log?.info({ eventId: event.id, type: event.type, outcome }, 'inbound event');
  res.status(outcome === 'handled' ? 202 : 200).json({ outcome });
}
