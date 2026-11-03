import { config } from '#config';

const base = () => ({
  secure: config.BFF_COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  domain: config.BFF_COOKIE_DOMAIN,
});

const maxAge = () => config.BFF_SESSION_TTL_DAYS * 86_400_000;

export function setSessionCookies(res, { sessionToken, csrfToken }) {
  res.cookie(config.BFF_COOKIE_NAME, sessionToken, { ...base(), httpOnly: true, maxAge: maxAge() });
  res.cookie(config.BFF_CSRF_COOKIE_NAME, csrfToken, { ...base(), httpOnly: false, maxAge: maxAge() });
}

export function clearSessionCookies(res) {
  res.clearCookie(config.BFF_COOKIE_NAME, { ...base(), httpOnly: true });
  res.clearCookie(config.BFF_CSRF_COOKIE_NAME, { ...base(), httpOnly: false });
}

export const readSessionToken = (req) => req.cookies?.[config.BFF_COOKIE_NAME] ?? null;
export const readCsrfToken = (req) => req.get('x-csrf-token') ?? null;
