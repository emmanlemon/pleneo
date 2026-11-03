import rateLimit from 'express-rate-limit';
import { config } from '#config';
import { RateLimitError } from '#common/errors/app-error.js';

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.RATE_LIMIT_ENABLED,
  handler: (_req, _res, next) => next(new RateLimitError()),
};

export const globalLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 3000 });
export const publishLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 600 });
export const ingestLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 600 });
export const adminWriteLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 120 });
