import { createHmac, timingSafeEqual } from 'node:crypto';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const signPayload = (secret, timestamp, body) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

export function verifySignedPayload({ secret, timestamp, body, signature, toleranceSeconds = 300 }) {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds)
    return { ok: false, reason: 'stale' };
  if (!signature || !safeEqual(signature, signPayload(secret, timestamp, body)))
    return { ok: false, reason: 'invalid' };
  return { ok: true };
}
