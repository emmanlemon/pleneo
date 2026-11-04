import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from './app-error.js';

export const DomainErrors = {
  missingToken: () => new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'),
  invalidToken: (message = 'Invalid or expired token') => new UnauthorizedError(message, 'INVALID_TOKEN'),
  tokenExpired: () => new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'),
  deviceAuthRequired: () => new UnauthorizedError('Device credentials required', 'DEVICE_AUTH_REQUIRED'),
  invalidDeviceCredential: () => new UnauthorizedError('Invalid device credentials', 'INVALID_DEVICE_CREDENTIAL'),
  deviceCredentialExpired: () => new UnauthorizedError('Device credential expired', 'DEVICE_CREDENTIAL_EXPIRED'),
  invalidSignature: () => new UnauthorizedError('Invalid webhook signature', 'INVALID_SIGNATURE'),
  staleSignature: () => new UnauthorizedError('Webhook timestamp outside tolerance', 'STALE_SIGNATURE'),
  webhooksNotConfigured: () => new ForbiddenError('Inbound webhooks are not configured', 'WEBHOOKS_NOT_CONFIGURED'),

  userTokenRequired: () => new ForbiddenError('User token required', 'USER_TOKEN_REQUIRED'),
  insufficientPermissions: () => new ForbiddenError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS'),
  insufficientScope: () => new ForbiddenError('Insufficient scope', 'INSUFFICIENT_SCOPE'),
  notOwner: () => new ForbiddenError('You do not have access to this device', 'NOT_RESOURCE_OWNER'),
  ownerRequired: () => new ForbiddenError('An owner must be named for this device', 'OWNER_REQUIRED'),
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

  simulationDisabled: () => new ForbiddenError('Device simulation is disabled', 'SIMULATION_DISABLED'),
  simulationLimitReached: (max) => new ConflictError(`At most ${max} devices may be simulated at once`, 'SIMULATION_LIMIT_REACHED'),
  deviceNotActivated: () => new ConflictError('The device must be activated before it can be simulated', 'DEVICE_NOT_ACTIVATED'),

  notFound: (entity = 'Resource') => new NotFoundError(`${entity} not found`, 'NOT_FOUND'),
};
