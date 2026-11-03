import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '#config';
import { RateLimitError } from '#common/errors/app-error.js';

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.RATE_LIMIT_ENABLED,
  handler: (_req, _res, next) => next(new RateLimitError()),
};

export const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  skip: (req) => !config.RATE_LIMIT_ENABLED || req.path.startsWith('/v1/device'),
});
export const writeLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 120 });

export const deviceLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: config.DEVICE_RATE_LIMIT_PER_MINUTE,
  keyGenerator: (req) => (req.device?.id ? `device:${req.device.id}` : ipKeyGenerator(req.ip)),
});

export const provisioningLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 30 });
