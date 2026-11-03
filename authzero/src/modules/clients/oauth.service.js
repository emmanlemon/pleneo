import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { signAccessToken, verifyAccessToken } from '#infra/security/jwt.js';
import { audit } from '#modules/audit/audit.service.js';
import * as sessions from '#modules/auth/repositories/session.repository.js';
import * as clients from './client.repository.js';
import { authenticateClient, parseClientCredentials } from './client-auth.js';

export async function clientCredentialsGrant(req, ctx) {
  const client = await authenticateClient(parseClientCredentials(req));
  const requested = req.body.scope ? req.body.scope.split(' ').filter(Boolean) : client.scopes;
  const allowed = new Set(client.scopes);
  if (!requested.every((s) => allowed.has(s))) throw DomainErrors.scopeNotGranted();

  const scope = requested.join(' ');
  const accessToken = await signAccessToken({
    subject: client.id,
    claims: { token_use: 'client', client_id: client.client_id, scope },
  });
  await clients.touch(client.id);
  await audit({ actorId: client.id, actorType: 'client', action: 'client.token_issued', ctx, metadata: { scope } });
  return { access_token: accessToken, token_type: 'Bearer', expires_in: config.ACCESS_TOKEN_TTL_SECONDS, scope };
}

async function isTokenLive(payload) {
  if (payload.token_use === 'client') return clients.isActive(payload.sub);
  const active = await sessions.listActiveForUser(payload.sub);
  return active.some((s) => s.id === payload.sid);
}

export async function introspect(req) {
  await authenticateClient(parseClientCredentials(req));
  let payload;
  try {
    payload = await verifyAccessToken(req.body.token);
  } catch {
    return { active: false };
  }
  if (!(await isTokenLive(payload))) return { active: false };
  const { token_use, client_id, scope, roles, permissions, email, sub, iss, aud, iat, exp, jti } = payload;
  return { active: true, sub, token_use, client_id, scope, roles, permissions, email, iss, aud, iat, exp, jti };
}
