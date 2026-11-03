import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { config } from '#config';
import { errorHandler, notFoundHandler } from '#common/errors/error-handler.js';
import { logger } from '#infra/logging/logger.js';
import { globalLimiter } from '#common/middleware/rate-limit.js';
import { enforceJsonContentType, noCache, requestId } from '#common/middleware/security.js';
import { router } from './api/router.js';

const FORM_ENCODED_PREFIXES = ['/oauth/'];

const httpLogger = () =>
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  });

const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  });

const corsPolicy = () =>
  cors({
    origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.set('etag', false);

  app.use(requestId);
  app.use(httpLogger());
  app.use(securityHeaders());
  app.use(corsPolicy());
  app.use(hpp());
  app.use(globalLimiter);
  app.use(noCache);
  app.use(enforceJsonContentType(FORM_ENCODED_PREFIXES));
  app.use(express.json({ limit: '64kb', strict: true }));
  app.use(cookieParser());

  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
