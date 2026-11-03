import { authenticator } from 'otplib';
import { config } from '#config';

authenticator.options = { window: 1, step: 30, digits: 6 };

const ISSUER = new URL(config.JWT_ISSUER).hostname;

export const generateSecret = () => authenticator.generateSecret(32);
export const keyUri = (email, secret) => authenticator.keyuri(email, ISSUER, secret);
export const isTotpFormat = (code) => /^\d{6}$/.test(code);

export function checkTotp(code, secret) {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
