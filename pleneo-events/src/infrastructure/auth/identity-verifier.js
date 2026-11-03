import { errors as joseErrors, jwtVerify } from 'jose';
import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';

const key = config.INTERNAL_IDENTITY_KEY ? Buffer.from(config.INTERNAL_IDENTITY_KEY, 'hex') : null;

export const identityEnabled = () => key !== null;

export async function verifyIdentity(assertion) {
  try {
    const { payload } = await jwtVerify(assertion, key, {
      issuer: config.INTERNAL_IDENTITY_ISSUER,
      audience: config.INTERNAL_IDENTITY_AUDIENCE,
      algorithms: ['HS256'],
      typ: 'identity+jwt',
      clockTolerance: 5,
    });
    return payload;
  } catch (err) {
    throw err instanceof joseErrors.JWTExpired ? DomainErrors.tokenExpired() : DomainErrors.invalidToken();
  }
}
