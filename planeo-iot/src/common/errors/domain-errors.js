import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from './app-error.js';

export const DomainErrors = {
  missingToken: () => new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'),
  invalidToken: (message = 'Invalid or expired token') => new UnauthorizedError(message, 'INVALID_TOKEN'),
  tokenExpired: () => new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'),
  deviceAuthRequired: () => new UnauthorizedError('Device credentials required', 'DEVICE_AUTH_REQUIRED'),
  invalidDeviceCredential: () => new UnauthorizedError('Invalid device credentials', 'INVALID_DEVICE_CREDENTIAL'),
  deviceCredentialExpired: () => new UnauthorizedError('Device credential expired', 'DEVICE_CREDENTIAL_EXPIRED'),

  userTokenRequired: () => new ForbiddenError('User token required', 'USER_TOKEN_REQUIRED'),
  insufficientPermissions: () => new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS'),
  insufficientScope: () => new ForbiddenError('Insufficient scope', 'INSUFFICIENT_SCOPE'),
  notOwner: () => new ForbiddenError('You do not have access to this device', 'NOT_DEVICE_OWNER'),
  deviceDisabled: () => new ForbiddenError('Device is disabled', 'DEVICE_DISABLED'),

  malformedJson: () => new BadRequestError('Malformed JSON body', 'MALFORMED_JSON'),
  invalidReference: () => new BadRequestError('Referenced resource does not exist', 'INVALID_REFERENCE'),
  unknownMetric: (metric) =>
    new BadRequestError(`Metric "${metric}" is not declared on this device type`, 'UNKNOWN_METRIC'),
  timestampSkew: () => new BadRequestError('Reading timestamp is too far in the future', 'TIMESTAMP_SKEW'),
  timestampTooOld: () =>
    new BadRequestError('Reading timestamp is older than the accepted backfill window', 'TIMESTAMP_TOO_OLD'),
  batchTooLarge: (max) => new BadRequestError(`Batch exceeds the maximum of ${max} readings`, 'BATCH_TOO_LARGE'),

  alreadyActivated: () => new ConflictError('Device is already activated', 'DEVICE_ALREADY_ACTIVATED'),
  invalidCommandTransition: (from, to) =>
    new ConflictError(`Cannot move command from "${from}" to "${to}"`, 'INVALID_COMMAND_TRANSITION'),
  invalidAlertTransition: (from, to) =>
    new ConflictError(`Cannot move alert from "${from}" to "${to}"`, 'INVALID_ALERT_TRANSITION'),
  duplicateExternalId: () =>
    new ConflictError('A device with that external id already exists', 'DUPLICATE_EXTERNAL_ID'),

  notFound: (entity = 'Resource') => new NotFoundError(`${entity} not found`, 'NOT_FOUND'),
};
