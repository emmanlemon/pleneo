import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '#config';
import { RateLimitError } from '#common/errors/app-error.js';

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.RATE_LIMIT_ENABLED,
  handler: (_req, _res, next) => next(new RateLimitError()),
};

const byPrincipal = (req) =>
  req.auth?.userId ?? req.auth?.clientId ?? ipKeyGenerator(req.ip ?? '', false);

export const globalLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 2000 });
export const writeLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 60 });
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true });
export const sensitiveLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 10 });
export const gatewayLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: config.GATEWAY_RATE_LIMIT_PER_MINUTE,
  keyGenerator: byPrincipal,
});
