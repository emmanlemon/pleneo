import { config } from '#config';

const options = () => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/v1/auth',
  domain: config.COOKIE_DOMAIN,
});

export const setRefreshCookie = (res, refreshToken) =>
  res.cookie(config.COOKIE_NAME, refreshToken, { ...options(), maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });

export const clearRefreshCookie = (res) => res.clearCookie(config.COOKIE_NAME, options());

export const readRefreshToken = (req) => req.body?.refreshToken ?? req.cookies?.[config.COOKIE_NAME] ?? null;
