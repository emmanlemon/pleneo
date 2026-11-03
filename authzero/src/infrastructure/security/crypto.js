import argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '#config';

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };
const KEK = Buffer.from(config.KEY_ENCRYPTION_KEY, 'hex');

export const hashPassword = (password) => argon2.hash(password, ARGON_OPTS);
export const verifyPassword = (hash, password) => argon2.verify(hash, password).catch(() => false);
export const needsRehash = (hash) => argon2.needsRehash(hash, ARGON_OPTS);

export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');
export const randomId = () => randomBytes(16).toString('hex');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const hmacSha256 = (key, value) => createHmac('sha256', key).update(value).digest('hex');
export const keyedHash = (value) => hmacSha256(KEK, value);

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
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

export function recoveryCode() {
  const part = () => Array.from({ length: 5 }, () => randomInt(0, 36).toString(36)).join('');
  return `${part()}-${part()}`;
}

let dummyHash;
export async function dummyPasswordVerify() {
  dummyHash ??= await hashPassword(randomToken(32));
  await verifyPassword(dummyHash, 'x');
}
