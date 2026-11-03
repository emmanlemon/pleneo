import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from './app-error.js';

export class NonRetryableError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'NonRetryableError';
    this.retryable = false;
  }
}

export const DomainErrors = {
  missingToken: () => new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'),
  invalidToken: (message = 'Invalid or expired token') => new UnauthorizedError(message, 'INVALID_TOKEN'),
  tokenExpired: () => new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'),
  invalidSignature: () => new UnauthorizedError('Invalid webhook signature', 'INVALID_SIGNATURE'),
  staleSignature: () => new UnauthorizedError('Webhook timestamp outside tolerance', 'STALE_SIGNATURE'),

  userTokenRequired: () => new ForbiddenError('User token required', 'USER_TOKEN_REQUIRED'),
  insufficientPermissions: () => new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS'),
  insufficientScope: () => new ForbiddenError('Insufficient scope', 'INSUFFICIENT_SCOPE'),

  malformedJson: () => new BadRequestError('Malformed JSON body', 'MALFORMED_JSON'),
  invalidReference: () => new BadRequestError('Referenced resource does not exist', 'INVALID_REFERENCE'),
  unknownJobType: (type) => new BadRequestError(`No handler registered for job type "${type}"`, 'UNKNOWN_JOB_TYPE'),
  invalidCron: (message) => new BadRequestError(`Invalid cron expression: ${message}`, 'INVALID_CRON'),
  invalidTransition: (from, to) =>
    new ConflictError(`Cannot move job from "${from}" to "${to}"`, 'INVALID_JOB_TRANSITION'),

  notFound: (entity = 'Resource') => new NotFoundError(`${entity} not found`, 'NOT_FOUND'),
};
