import { AppError, BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from './app-error.js';

export const DomainErrors = {
  missingToken: () => new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'),
  invalidToken: (message = 'Invalid or expired token') => new UnauthorizedError(message, 'INVALID_TOKEN'),
  tokenExpired: () => new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'),
  tokenRevoked: () => new UnauthorizedError('Token has been revoked', 'TOKEN_REVOKED'),

  userTokenRequired: () => new ForbiddenError('User token required', 'USER_TOKEN_REQUIRED'),
  insufficientPermissions: () => new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS'),
  insufficientScope: () => new ForbiddenError('Insufficient scope', 'INSUFFICIENT_SCOPE'),
  notOwner: () => new ForbiddenError('You do not have access to this resource', 'NOT_RESOURCE_OWNER'),

  malformedJson: () => new BadRequestError('Malformed JSON body', 'MALFORMED_JSON'),
  invalidReference: () => new BadRequestError('Referenced resource does not exist', 'INVALID_REFERENCE'),
  invalidDateRange: () => new BadRequestError('End date must not be before start date', 'INVALID_DATE_RANGE'),

  invalidSignature: () => new UnauthorizedError('Invalid webhook signature', 'INVALID_SIGNATURE'),
  staleSignature: () => new UnauthorizedError('Webhook timestamp outside tolerance', 'STALE_SIGNATURE'),
  webhooksNotConfigured: () => new ForbiddenError('Inbound webhooks are not configured', 'WEBHOOKS_NOT_CONFIGURED'),

  sessionRequired: () => new UnauthorizedError('No active session', 'SESSION_REQUIRED'),
  csrfFailed: () => new ForbiddenError('Missing or invalid CSRF token', 'CSRF_FAILED'),
  upstreamUnavailable: (service) => new AppError(503, 'UPSTREAM_UNAVAILABLE', `${service} is unavailable`),

  notFound: (entity = 'Resource') => new NotFoundError(`${entity} not found`, 'NOT_FOUND'),
};
