import { apiReference } from '@scalar/express-api-reference';
import { Router } from 'express';
import { config } from '#config';
import { buildOpenApiDocument } from './openapi.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ');

export const docsRouter = Router();

if (config.DOCS_ENABLED) {
  const document = buildOpenApiDocument();

  docsRouter.get('/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(document);
  });

  docsRouter.use(
    '/docs',
    (_req, res, next) => {
      res.setHeader('Content-Security-Policy', CSP);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    apiReference({ url: '/openapi.json', pageTitle: 'authzero API' }),
  );
}
