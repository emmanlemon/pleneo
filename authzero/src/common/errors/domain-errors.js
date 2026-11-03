import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
  UnauthorizedError,
} from './app-error.js';

export const DomainErrors = {
  invalidCredentials: () => new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS'),
  invalidToken: (message = 'Invalid or expired token') => new UnauthorizedError(message, 'INVALID_TOKEN'),
  tokenExpired: () => new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'),
  missingToken: (message = 'Authentication required') => new UnauthorizedError(message, 'AUTHENTICATION_REQUIRED'),
  clientAuthRequired: () => new UnauthorizedError('Client authentication required', 'CLIENT_AUTHENTICATION_REQUIRED'),
  invalidClient: () => new UnauthorizedError('Invalid client credentials', 'INVALID_CLIENT'),
  mfaInvalid: () => new UnauthorizedError('Invalid authentication code', 'MFA_INVALID'),
  sessionRevoked: () => new UnauthorizedError('Session is no longer valid', 'SESSION_REVOKED'),
  credentialsChanged: () => new UnauthorizedError('Credentials changed, please sign in again', 'CREDENTIALS_CHANGED'),
  refreshReuse: () => new UnauthorizedError('Refresh token reuse detected', 'REFRESH_TOKEN_REUSE'),

  emailUnverified: () => new ForbiddenError('Email address not verified', 'EMAIL_UNVERIFIED'),
  accountDisabled: () => new ForbiddenError('Account is disabled', 'ACCOUNT_DISABLED'),
  insufficientPermissions: () => new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS'),
  insufficientScope: () => new ForbiddenError('Insufficient scope', 'INSUFFICIENT_SCOPE'),
  userTokenRequired: () => new ForbiddenError('User token required', 'USER_TOKEN_REQUIRED'),
  mfaStepUpRequired: () =>
    new ForbiddenError('Multi-factor authentication required for this action', 'MFA_STEP_UP_REQUIRED'),
  selfModification: (message) => new ForbiddenError(message, 'SELF_MODIFICATION_FORBIDDEN'),
  scopeNotGranted: () => new ForbiddenError('Requested scope not granted to client', 'SCOPE_NOT_GRANTED'),

  accountLocked: () => new LockedError(),

  passwordContainsEmail: () =>
    new BadRequestError('Password must not contain your email address', 'PASSWORD_CONTAINS_EMAIL'),
  passwordReused: () => new BadRequestError('Password was used recently', 'PASSWORD_REUSED'),
  malformedJson: () => new BadRequestError('Malformed JSON body', 'MALFORMED_JSON'),
  invalidReference: () => new BadRequestError('Referenced resource does not exist', 'INVALID_REFERENCE'),

  mfaAlreadyEnabled: () => new ConflictError('MFA already enabled', 'MFA_ALREADY_ENABLED'),
  mfaNotEnabled: () => new ConflictError('MFA not enabled', 'MFA_NOT_ENABLED'),
  alreadyExists: () => new ConflictError('Resource already exists', 'ALREADY_EXISTS'),

  notFound: (entity = 'Resource') => new NotFoundError(`${entity} not found`, 'NOT_FOUND'),
};
