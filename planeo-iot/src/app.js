import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { config } from '#config';
import { errorHandler, notFoundHandler } from '#common/errors/error-handler.js';
import { globalLimiter } from '#common/middleware/rate-limit.js';
import { enforceJsonContentType, noCache, requestId } from '#common/middleware/security.js';
import { logger } from '#infra/logging/logger.js';
import { router } from './api/router.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.set('etag', false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/ready' || req.url === '/v1/device/heartbeat',
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(
    cors({
      origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  app.use(hpp());
  app.use(globalLimiter);
  app.use(noCache);
  app.use(enforceJsonContentType);
  app.use(express.json({ limit: '512kb', strict: true }));

  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
