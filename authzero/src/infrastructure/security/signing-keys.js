import { exportJWK, exportPKCS8, generateKeyPair, importJWK, importPKCS8 } from 'jose';
import { query, withTransaction } from '#infra/database/pool.js';
import { config } from '#config';
import { decrypt, encrypt, randomId } from './crypto.js';
import { logger } from '#infra/logging/logger.js';

export const ALG = 'RS256';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { active: null, publicKeys: new Map(), jwks: { keys: [] }, loadedAt: 0 };

async function generate() {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { modulusLength: 3072 });
  const kid = randomId();
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: 'sig' };
  return { kid, privateKeyEnc: encrypt(await exportPKCS8(privateKey)), jwk };
}

export async function rotateSigningKey() {
  const key = await generate();
  await withTransaction(async (client) => {
    await client.query(`UPDATE signing_keys SET status = 'retired', retired_at = now() WHERE status = 'active'`);
    await client.query(`INSERT INTO signing_keys (kid, alg, private_key_enc, public_jwk) VALUES ($1, $2, $3, $4)`, [
      key.kid,
      ALG,
      key.privateKeyEnc,
      key.jwk,
    ]);
  });
  cache.loadedAt = 0;
  logger.info({ kid: key.kid }, 'signing key rotated');
  return key.kid;
}

export async function loadKeys(force = false) {
  if (!force && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;

  const { rows } = await query(
    `SELECT kid, alg, private_key_enc, public_jwk, status, created_at
       FROM signing_keys ORDER BY created_at DESC`,
  );

  if (!rows.some((r) => r.status === 'active')) {
    await rotateSigningKey();
    return loadKeys(true);
  }

  const publicKeys = new Map();
  const jwks = { keys: [] };
  let active = null;

  for (const row of rows) {
    publicKeys.set(row.kid, await importJWK(row.public_jwk, row.alg));
    jwks.keys.push(row.public_jwk);
    if (row.status === 'active') {
      active = {
        kid: row.kid,
        alg: row.alg,
        privateKey: await importPKCS8(decrypt(row.private_key_enc), row.alg),
        createdAt: row.created_at,
      };
    }
  }

  cache = { active, publicKeys, jwks, loadedAt: Date.now() };
  return cache;
}

export async function getActiveKey() {
  return (await loadKeys()).active;
}

export async function getPublicKey(kid) {
  let keys = await loadKeys();
  if (!keys.publicKeys.has(kid)) keys = await loadKeys(true);
  return keys.publicKeys.get(kid) ?? null;
}

export async function getJwks() {
  return (await loadKeys()).jwks;
}

export async function rotateIfDue() {
  const active = await getActiveKey();
  const ageDays = (Date.now() - new Date(active.createdAt).getTime()) / 86_400_000;
  if (ageDays >= config.SIGNING_KEY_ROTATION_DAYS) await rotateSigningKey();
}

export async function pruneRetiredKeys() {
  const graceSeconds = config.ACCESS_TOKEN_TTL_SECONDS * 2 + 86_400;
  await query(
    `DELETE FROM signing_keys WHERE status = 'retired' AND retired_at < now() - ($1 || ' seconds')::interval`,
    [String(graceSeconds)],
  );
}

export async function listKeys() {
  const { rows } = await query(
    `SELECT kid, alg, status, created_at, retired_at FROM signing_keys ORDER BY created_at DESC`,
  );
  return rows;
}
