import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '#config';

const KEK = Buffer.from(config.SECRETS_ENCRYPTION_KEY, 'hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const hmacSha256 = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

export const signPayload = (secret, timestamp, body) => `sha256=${hmacSha256(secret, `${timestamp}.${body}`)}`;

export function verifySignedPayload({
  secret,
  timestamp,
  body,
  signature,
  toleranceSeconds = config.SIGNATURE_TOLERANCE_SECONDS,
}) {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds)
    return { ok: false, reason: 'stale' };
  if (!signature || !safeEqual(signature, signPayload(secret, timestamp, body)))
    return { ok: false, reason: 'invalid' };
  return { ok: true };
}

export function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEK, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', KEK, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
