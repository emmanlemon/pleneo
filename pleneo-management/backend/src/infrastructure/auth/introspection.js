import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { logger } from '#infra/logging/logger.js';

const cache = new Map();
const MAX_CACHE_ENTRIES = 10_000;

function remember(jti, active, expSeconds) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  const ttl = Math.min(config.AUTH_INTROSPECTION_CACHE_SECONDS * 1000, Math.max(0, expSeconds * 1000 - Date.now()));
  cache.set(jti, { active, until: Date.now() + ttl });
}

async function introspect(token) {
  const basic = Buffer.from(`${config.AUTH_CLIENT_ID}:${config.AUTH_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${config.AUTH_INTERNAL_URL}/oauth/introspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${basic}` },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`introspection responded ${res.status}`);
  return (await res.json()).active === true;
}

export async function assertNotRevoked(token, payload) {
  if (!config.AUTH_INTROSPECTION_ENABLED) return;
  const cached = cache.get(payload.jti);
  if (cached && cached.until > Date.now()) {
    if (!cached.active) throw DomainErrors.tokenRevoked();
    return;
  }
  let active;
  try {
    active = await introspect(token);
  } catch (err) {
    logger.warn({ err: err.message }, 'introspection unavailable, accepting signed token');
    return;
  }
  remember(payload.jti, active, payload.exp);
  if (!active) throw DomainErrors.tokenRevoked();
}

export const clearIntrospectionCache = () => cache.clear();
