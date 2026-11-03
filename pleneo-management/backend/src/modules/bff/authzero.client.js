import { config } from '#config';
import { AppError } from '#common/errors/app-error.js';
import { DomainErrors } from '#common/errors/domain-errors.js';

const TIMEOUT_MS = 10_000;

export class UpstreamAuthError extends AppError {
  constructor(status, code, message, details) {
    super(status, code, message, details);
    this.name = 'UpstreamAuthError';
  }
}

async function call(path, { method = 'POST', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${config.AUTH_INTERNAL_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'The authentication provider is unavailable');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.ok) return data;

  throw new UpstreamAuthError(
    res.status,
    data?.code ?? 'AUTHENTICATION_FAILED',
    data?.detail ?? 'Authentication failed',
    data?.errors,
  );
}

export const login = (credentials) => call('/auth/login', { body: credentials });
export const loginMfa = (payload) => call('/auth/login/mfa', { body: payload });
export const refresh = (refreshToken) => call('/auth/refresh', { body: { refreshToken } });
export const logout = (accessToken) => call('/auth/logout', { token: accessToken }).catch(() => undefined);
export const profile = (accessToken) => call('/users/me', { method: 'GET', token: accessToken });

export const register = (payload) => call('/auth/register', { body: payload });
export const verifyEmail = (payload) => call('/auth/email/verify', { body: payload });
export const resendVerification = (payload) => call('/auth/email/resend', { body: payload });
export const forgotPassword = (payload) => call('/auth/password/forgot', { body: payload });
export const resetPassword = (payload) => call('/auth/password/reset', { body: payload });
export const changePassword = (payload, accessToken) => call('/auth/password/change', { body: payload, token: accessToken });

export function accessTokenExpiry(accessToken) {
  const [, claims] = accessToken.split('.');
  if (!claims) throw DomainErrors.invalidToken('Malformed access token from the provider');
  const { exp } = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  return new Date(exp * 1000);
}
