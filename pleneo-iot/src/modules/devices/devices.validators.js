import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, query, validate } from '#common/validation/validator.js';

const idParams = z.object({ id: r.uuid });

export const metricKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Use lower-case letters, digits and underscores');
export const externalId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/, 'Use 3-64 letters, digits, dots, colons, dashes or underscores');
export const jsonObject = z.record(z.string(), z.unknown());

export const metricDefinition = r.strictObject({
  key: metricKey,
  unit: z.string().trim().max(16).default(''),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const deviceStatus = z.enum(['provisioning', 'active', 'disabled']);
export const connectionStatus = z.enum(['online', 'offline', 'unknown']);

export const deviceListQuery = r.pagination(200).extend({
  projectId: r.uuid.optional(),
  status: deviceStatus.optional(),
  connectionStatus: connectionStatus.optional(),
  deviceTypeId: r.uuid.optional(),
  search: r.searchTerm.optional(),
});

export const deviceStatsQuery = r.strictObject({ projectId: r.uuid.optional() });

export const registerDeviceSchema = r.strictObject({
  externalId,
  name: r.name,
  deviceTypeId: r.uuid,
  projectId: r.uuid,
  ownerId: r.uuid.optional(),
  site: z.string().trim().max(120).optional(),
  metadata: jsonObject.default({}),
});

export const updateDeviceSchema = r
  .strictObject({
    name: r.name.optional(),
    projectId: r.uuid.optional(),
    site: z.string().trim().max(120).optional(),
    metadata: jsonObject.optional(),
    firmware: z.string().trim().max(60).optional(),
    status: deviceStatus.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const rotateCredentialSchema = r.strictObject({
  label: z.string().trim().min(1).max(40).default('primary'),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  revokeExisting: z.boolean().default(true),
});

export const activateSchema = r.strictObject({
  externalId,
  claimCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Invalid claim code'),
  firmware: z.string().trim().max(60).optional(),
});

export const createDeviceTypeSchema = r.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, 'Use lower-case letters, digits and dashes'),
  name: r.name,
  description: r.description.default(''),
  metrics: z.array(metricDefinition).min(1).max(50),
});

export const validateId = params(idParams);
export const validateCredentialId = params(idParams.extend({ credentialId: r.uuid }));
export const validateDeviceList = query(deviceListQuery);
export const validateDeviceStats = query(deviceStatsQuery);
export const validateRegister = body(registerDeviceSchema);
export const validateUpdate = validate({ params: idParams, body: updateDeviceSchema });
export const validateRotateCredential = validate({ params: idParams, body: rotateCredentialSchema });
export const validateDesiredState = validate({ params: idParams, body: jsonObject });
export const validateActivate = body(activateSchema);
export const validateCreateDeviceType = body(createDeviceTypeSchema);
