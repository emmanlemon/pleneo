import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '#config';

const KEY = Buffer.from(config.DEVICE_SECRET_KEY, 'hex');
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const keyedHash = (value) => createHmac('sha256', KEY).update(value).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

export const claimCode = () =>
  Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => CLAIM_ALPHABET[randomInt(0, CLAIM_ALPHABET.length)]).join(''),
  ).join('-');

export const deviceToken = (deviceId) => `dev_${deviceId.replace(/-/g, '')}_${randomToken(32)}`;

export function parseDeviceToken(token) {
  const match = /^dev_([0-9a-f]{32})_([A-Za-z0-9_-]{20,})$/.exec(token ?? '');
  if (!match) return null;
  const hex = match[1];
  const deviceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { deviceId, token };
}
