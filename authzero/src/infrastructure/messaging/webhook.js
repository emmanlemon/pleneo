import { config } from '#config';
import { hmacSha256 } from '#infra/security/crypto.js';
import { logger } from '#infra/logging/logger.js';

const TIMEOUT_MS = 10_000;

export async function deliver(event) {
  if (!config.EVENT_WEBHOOK_URL) {
    logger.info({ eventId: event.id, type: event.type, payload: event.payload }, 'event (no webhook configured)');
    return;
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ id: event.id, type: event.type, payload: event.payload, createdAt: event.created_at });
  const signature = hmacSha256(config.EVENT_WEBHOOK_SECRET, `${timestamp}.${body}`);

  const res = await fetch(config.EVENT_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-authzero-timestamp': timestamp,
      'x-authzero-signature': `sha256=${signature}`,
      'x-authzero-event': event.type,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`webhook responded ${res.status}`);
}
