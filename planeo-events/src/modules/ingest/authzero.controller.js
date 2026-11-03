import { z } from 'zod';
import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { ValidationError } from '#common/errors/app-error.js';
import { formatZodIssues } from '#common/validation/validator.js';
import { verifySignedPayload } from '#infra/security/crypto.js';
import { publish } from '#modules/events/event.service.js';

const envelope = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  type: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

export async function ingestAuthzero(req, res) {
  const verdict = verifySignedPayload({
    secret: config.AUTHZERO_WEBHOOK_SECRET,
    timestamp: req.get('x-authzero-timestamp'),
    body: req.rawBody?.toString('utf8') ?? '',
    signature: req.get('x-authzero-signature'),
  });
  if (!verdict.ok) throw verdict.reason === 'stale' ? DomainErrors.staleSignature() : DomainErrors.invalidSignature();

  const parsed = envelope.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(formatZodIssues(parsed.error.issues, 'body'));

  const { id, type, payload, createdAt } = parsed.data;
  const result = await publish({
    type: `auth.${type}`,
    payload,
    source: 'authzero',
    idempotencyKey: `authzero:${id}`,
    occurredAt: createdAt,
    createdBy: 'authzero-webhook',
  });
  res.status(result.duplicate ? 200 : 202).json({ eventId: result.event.id, duplicate: result.duplicate });
}
