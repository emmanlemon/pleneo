import { ZodError } from 'zod';
import {
  AppError,
  InternalError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnsupportedMediaTypeError,
  ValidationError,
} from './app-error.js';
import { DomainErrors } from './domain-errors.js';
import { PROBLEM_CONTENT_TYPE, toProblemDetails } from './problem-details.js';
import { formatZodIssues } from '../validation/validator.js';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNAVAILABLE = new Set(['57P01', '57P02', '57P03', '57014', '08000', '08003', '08006', '53300']);
const NETWORK_UNAVAILABLE = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);

function normalize(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new ValidationError(formatZodIssues(err.issues, 'body'));
  if (err.type === 'entity.parse.failed') return DomainErrors.malformedJson();
  if (err.type === 'entity.too.large') return new PayloadTooLargeError();
  if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') return new UnsupportedMediaTypeError();
  if (err.code === PG_UNIQUE_VIOLATION) return DomainErrors.alreadyExists();
  if (err.code === PG_FOREIGN_KEY_VIOLATION) return DomainErrors.invalidReference();
  if (PG_UNAVAILABLE.has(err.code) || NETWORK_UNAVAILABLE.has(err.code)) return new ServiceUnavailableError();
  return new InternalError();
}

export function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err, req, res, _next) {
  const error = normalize(err);
  const log = req.log ?? console;

  if (!error.isOperational) log.error({ err, requestId: req.id }, 'unhandled error');
  else if (error.status >= 500) log.error({ code: error.code, cause: err.message }, error.message);
  else log.warn({ code: error.code, status: error.status }, error.message);

  if (res.headersSent) return;
  if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(error.status).type(PROBLEM_CONTENT_TYPE).json(toProblemDetails(error, req));
}
