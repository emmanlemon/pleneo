import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler } from '#common/http/async-handler.js';
import { identityEnabled, verifyIdentity } from '#infra/auth/identity-verifier.js';
import { verifyAccessToken } from '#infra/auth/token-verifier.js';

const IDENTITY_HEADER = 'x-planeo-identity';

function extractBearer(req) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
}

const toPrincipal = (payload, viaGateway) =>
  payload.token_use === 'client'
    ? {
        type: 'client',
        clientId: payload.sub,
        scopes: payload.scope?.split(' ') ?? [],
        roles: [],
        permissions: [],
        jti: payload.jti,
        viaGateway,
      }
    : {
        type: 'user',
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
        scopes: [],
        jti: payload.jti,
        viaGateway,
      };

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
