import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';

const jwks = createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), {
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30 * 1000,
  timeoutDuration: 5 * 1000,
});

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.AUTH_ISSUER,
      audience: config.AUTH_AUDIENCE,
      algorithms: ['RS256'],
      typ: 'at+jwt',
      clockTolerance: 5,
    });
    return payload;
  } catch (err) {
    throw err instanceof joseErrors.JWTExpired ? DomainErrors.tokenExpired() : DomainErrors.invalidToken();
  }
}
