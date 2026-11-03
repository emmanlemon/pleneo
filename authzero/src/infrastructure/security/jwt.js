import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { ALG, getActiveKey, getPublicKey } from './signing-keys.js';
import { randomId } from './crypto.js';

const TOKEN_TYPES = { access: 'at+jwt', mfa: 'mfa+jwt' };

async function sign({ subject, claims, ttlSeconds, type }) {
  const key = await getActiveKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: type })
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setSubject(subject)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomId())
    .sign(key.privateKey);
}

const resolveKey = async (header) => {
  const key = await getPublicKey(header.kid);
  if (!key) throw new joseErrors.JWSSignatureVerificationFailed();
  return key;
};

async function verify(token, type) {
  try {
    const { payload } = await jwtVerify(token, resolveKey, {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      algorithms: [ALG],
      typ: type,
      clockTolerance: 5,
    });
    return payload;
  } catch (err) {
    throw err instanceof joseErrors.JWTExpired ? DomainErrors.tokenExpired() : DomainErrors.invalidToken();
  }
}

export const signAccessToken = ({ subject, claims }) =>
  sign({ subject, claims, ttlSeconds: config.ACCESS_TOKEN_TTL_SECONDS, type: TOKEN_TYPES.access });
export const verifyAccessToken = (token) => verify(token, TOKEN_TYPES.access);
export const signMfaToken = ({ subject, claims }) =>
  sign({ subject, claims, ttlSeconds: config.MFA_CHALLENGE_TTL_SECONDS, type: TOKEN_TYPES.mfa });
export const verifyMfaToken = (token) => verify(token, TOKEN_TYPES.mfa);
