import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler } from '#common/http/async-handler.js';
import { identityEnabled, verifyIdentity } from '#infra/auth/identity-verifier.js';
import { verifyAccessToken } from '#infra/auth/token-verifier.js';

const IDENTITY_HEADER = 'x-pleneo-identity';

function extractBearer(req) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
}

function toPrincipal(payload, viaGateway) {
  if (payload.token_use === 'client') {
    const scopes = payload.scope ? payload.scope.split(' ') : [];
    return {
      type: 'client',
      clientId: payload.sub,
      scopes,
      permissions: scopes,
      roles: [],
      jti: payload.jti,
      viaGateway,
    };
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
    viaGateway,
  };
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const assertion = req.get(IDENTITY_HEADER);
  if (assertion && identityEnabled()) {
    req.auth = toPrincipal(await verifyIdentity(assertion), true);
    return next();
  }

  const token = extractBearer(req);
  if (!token) throw DomainErrors.missingToken();
  req.auth = toPrincipal(await verifyAccessToken(token), false);
  next();
});

export const actorOf = (auth) => (auth.type === 'user' ? `user:${auth.userId}` : `client:${auth.clientId}`);
