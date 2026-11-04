import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler } from '#common/http/async-handler.js';
import { assertNotRevoked } from '#infra/auth/introspection.js';
import { verifyAccessToken } from '#infra/auth/token-verifier.js';
import { readCsrfToken, readSessionToken } from '#modules/bff/session-cookie.js';
import { assertCsrf, resolve } from '#modules/bff/session.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractBearer(req) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
}

function toPrincipal(payload) {
  if (payload.token_use === 'client') {
    const scopes = payload.scope ? payload.scope.split(' ') : [];
    return { type: 'client', clientId: payload.sub, scopes, permissions: scopes, roles: [], jti: payload.jti };
  }
  return {
    type: 'user',
    userId: payload.sub,
    sessionId: payload.sid,
    email: payload.email,
    roles: payload.roles ?? [],
    permissions: payload.permissions ?? [],
    amr: payload.amr ?? [],
    scopes: [],
    jti: payload.jti,
  };
}

async function fromBearer(req, token) {
  const payload = await verifyAccessToken(token);
  await assertNotRevoked(token, payload);
  req.auth = toPrincipal(payload);
}

async function fromSession(req) {
  const resolved = await resolve(readSessionToken(req));
  if (!resolved) throw DomainErrors.sessionRequired();
  if (MUTATING.has(req.method)) assertCsrf(resolved.session, readCsrfToken(req));

  req.auth = toPrincipal(await verifyAccessToken(resolved.accessToken));
  req.bff = { sessionId: resolved.session.id, accessToken: resolved.accessToken, csrfHash: resolved.session.csrf_hash };
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const bearer = extractBearer(req);
  if (bearer) {
    await fromBearer(req, bearer);
    return next();
  }
  if (config.BFF_ENABLED && readSessionToken(req)) {
    await fromSession(req);
    return next();
  }
  throw DomainErrors.missingToken();
});
