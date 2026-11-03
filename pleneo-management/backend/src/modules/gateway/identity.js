import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { config } from '#config';

const key = config.INTERNAL_IDENTITY_KEY ? Buffer.from(config.INTERNAL_IDENTITY_KEY, 'hex') : null;

export const identityEnabled = () => key !== null;

const claimsFor = (auth) =>
  auth.type === 'client'
    ? { token_use: 'client', scope: auth.scopes.join(' ') }
    : {
        token_use: 'user',
        email: auth.email,
        roles: auth.roles,
        permissions: auth.permissions,
        sid: auth.sessionId,
      };

export function mintIdentity(auth, audience, requestId) {
  return new SignJWT({ ...claimsFor(auth), rid: requestId })
    .setProtectedHeader({ alg: 'HS256', typ: 'identity+jwt' })
    .setIssuer(config.INTERNAL_IDENTITY_ISSUER)
    .setAudience(audience)
    .setSubject(auth.type === 'client' ? auth.clientId : auth.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.INTERNAL_IDENTITY_TTL_SECONDS}s`)
    .sign(key);
}
