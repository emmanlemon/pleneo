import { randomUUID } from 'node:crypto';
import { UnsupportedMediaTypeError } from '#common/errors/app-error.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUEST_ID_PATTERN = /^[\w.-]{8,128}$/;

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

const hasBody = (req) =>
  req.get('transfer-encoding') || (req.get('content-length') && req.get('content-length') !== '0');

export function enforceJsonContentType(req, _res, next) {
  if (!MUTATING.has(req.method) || !hasBody(req)) return next();
  next(req.is('application/json') ? undefined : new UnsupportedMediaTypeError());
}

export function noCache(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
