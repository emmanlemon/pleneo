import { z } from 'zod';
import { config } from '#config';
import * as devices from '#modules/devices/devices.validators.js';
import { readingSchema } from '#modules/telemetry/telemetry.validators.js';
import { startSimulationSchema } from '#modules/simulation/simulation.routes.js';

const toSchema = (zodSchema) => {
  const { $schema, ...rest } = z.toJSONSchema(zodSchema, { io: 'input', unrepresentable: 'any' });
  return rest;
};

const jsonBody = (zodSchema, description) => ({
  required: true,
  description,
  content: { 'application/json': { schema: toSchema(zodSchema) } },
});

const json = (description, schema) => ({ description, content: { 'application/json': { schema } } });

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const problem = (description) => ({ description, content: { 'application/problem+json': { schema: ref('Problem') } } });

const ERRORS = {
  400: problem('Validation failed or the reading was rejected'),
  401: problem('Missing, invalid or expired credentials'),
  403: problem('Authenticated but not permitted'),
  404: problem('Resource not found'),
  409: problem('Conflicting state'),
  429: problem('Rate limited'),
};

const errors = (...codes) => Object.fromEntries(codes.map((code) => [code, ERRORS[code]]));

const pathParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const queryParams = (zodSchema) =>
  Object.entries(toSchema(zodSchema).properties ?? {}).map(([name, schema]) => ({
    name,
    in: 'query',
    required: false,
    schema,
  }));

const operation = ({ tag, summary, description, security, params = [], body, responses }) => ({
  tags: [tag],
  summary,
  description,
  ...(security ? { security } : {}),
  ...(params.length ? { parameters: params } : {}),
  ...(body ? { requestBody: body } : {}),
  responses,
});

const OPERATOR = { type: 'string', enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'] };
const SEVERITY = { type: 'string', enum: ['info', 'warning', 'critical'] };
const bearer = [{ bearerAuth: [] }];
const deviceAuth = [{ deviceToken: [] }];

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pleneo IoT',
      version: '1.0.0',
      description: [
        'Device registry, telemetry ingestion, threshold rules and command dispatch.',
        '',
        'The service exposes two authentication planes that never overlap.',
        'Operators and services call the management surface with an authzero RS256 token.',
        'Hardware calls `/v1/device/*` with its own `dev_<id>_<secret>` token, issued once at activation and rotatable from the console.',
        '',
        'Telemetry ingestion is idempotent on `(device, metric, timestamp)`: replaying a batch stores nothing new and reports the readings as duplicates.',
      ].join('\n'),
    },
    servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local' }],
    tags: [
      { name: 'System', description: 'Liveness, readiness and advertised limits' },
      { name: 'Devices', description: 'Registry, credentials and shadow state' },
      { name: 'Telemetry', description: 'Stored readings' },
      { name: 'Commands', description: 'Cloud to device commands' },
      { name: 'Rules', description: 'Threshold rules evaluated on ingest' },
      { name: 'Alerts', description: 'Raised alerts and their lifecycle' },
      { name: 'Device plane', description: 'Called by the hardware with a device token' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'authzero access token' },
        deviceToken: { type: 'http', scheme: 'bearer', description: 'Device token issued at activation' },
      },
      schemas: {
        Problem: {
          type: 'object',
          description: 'RFC 7807 problem details',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            code: { type: 'string', examples: ['VALIDATION_FAILED'] },
            detail: { type: 'string' },
            instance: { type: 'string' },
            requestId: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  source: { type: 'string', enum: ['body', 'query', 'params'] },
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          required: ['type', 'title', 'status', 'code', 'detail'],
        },
        Device: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            external_id: { type: 'string' },
            name: { type: 'string' },
            device_type_id: { type: 'string', format: 'uuid' },
            device_type_key: { type: 'string' },
            device_type_metrics: { type: 'array', items: toSchema(devices.metricDefinition) },
            owner_id: { type: 'string', format: 'uuid' },
            status: toSchema(devices.deviceStatus),
            connection_status: toSchema(devices.connectionStatus),
            site: { type: ['string', 'null'] },
            firmware: { type: ['string', 'null'] },
            last_seen_at: { type: ['string', 'null'], format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Reading: {
          type: 'object',
          properties: {
            metric: { type: 'string' },
            value: { type: 'number' },
            ts: { type: 'string', format: 'date-time' },
          },
        },
        Command: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            device_id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
            status: {
              type: 'string',
              enum: ['pending', 'dispatched', 'acknowledged', 'failed', 'expired', 'cancelled'],
            },
            result: { type: ['object', 'null'], additionalProperties: true },
            error: { type: ['string', 'null'] },
            expires_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Rule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            device_type_id: { type: ['string', 'null'], format: 'uuid' },
            device_id: { type: ['string', 'null'], format: 'uuid' },
            metric: { type: 'string' },
            operator: OPERATOR,
            threshold: { type: 'number' },
            severity: SEVERITY,
            cooldown_seconds: { type: 'integer' },
            enabled: { type: 'boolean' },
          },
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            device_id: { type: 'string', format: 'uuid' },
            device_name: { type: 'string' },
            metric: { type: 'string' },
            value: { type: 'number' },
            threshold: { type: 'number' },
            severity: SEVERITY,
            status: { type: 'string', enum: ['open', 'acknowledged', 'resolved'] },
            message: { type: 'string' },
            raised_at: { type: 'string', format: 'date-time' },
          },
        },
        DeviceState: {
          type: 'object',
          properties: {
            desired: { type: 'object', additionalProperties: true },
            reported: { type: 'object', additionalProperties: true },
            desired_version: { type: 'integer' },
            reported_version: { type: 'integer' },
          },
        },
        IngestResult: {
          type: 'object',
          properties: {
            accepted: { type: 'integer', description: 'Readings stored' },
            duplicates: { type: 'integer', description: 'Readings already present for that metric and timestamp' },
            alerts: { type: 'integer', description: 'Alerts raised by this batch' },
          },
        },
      },
    },
    security: bearer,
    paths: {
      '/health': {
        get: operation({
          tag: 'System',
          summary: 'Liveness probe',
          security: [],
          responses: { 200: json('Process is up', { type: 'object', properties: { status: { type: 'string' } } }) },
        }),
      },
      '/ready': {
        get: operation({
          tag: 'System',
          summary: 'Readiness probe',
          description: 'Returns 503 when the database is unreachable.',
          security: [],
          responses: {
            200: json('Ready', { type: 'object', properties: { status: { type: 'string' } } }),
            503: json('Dependencies unavailable', { type: 'object', properties: { status: { type: 'string' } } }),
          },
        }),
      },
      '/openapi.json': {
        get: operation({
          tag: 'System',
          summary: 'This document',
          security: [],
          responses: { 200: json('The OpenAPI document', { type: 'object' }) },
        }),
      },
      '/capabilities': {
        get: operation({
          tag: 'System',
          summary: 'Advertised ingest and lifecycle limits',
          description:
            'Devices and integrators read this to discover batch ceilings, accepted clock skew and the offline threshold.',
          security: [],
          responses: { 200: json('Limits', { type: 'object' }) },
        }),
      },

      '/v1/devices': {
        get: operation({
          tag: 'Devices',
          summary: 'List devices',
          description:
            'Regular users see devices they own. Admins and clients holding `devices:read` see every device.',
          params: queryParams(devices.deviceListQuery),
          responses: {
            200: json('A page of devices', {
              type: 'object',
              properties: {
                devices: { type: 'array', items: ref('Device') },
                nextCursor: { type: ['string', 'null'] },
              },
            }),
            ...errors(400, 401),
          },
        }),
        post: operation({
          tag: 'Devices',
          summary: 'Register a device',
          description:
            'Returns a one-time claim code. The code is shown once and is exchanged for a device token at activation.',
          body: jsonBody(devices.registerDeviceSchema),
          responses: {
            201: json('Registered', {
              allOf: [
                ref('Device'),
                { type: 'object', properties: { claimCode: { type: 'string', examples: ['ABCD-EFGH-IJKL'] } } },
              ],
            }),
            ...errors(400, 401, 403, 409),
          },
        }),
      },
      '/v1/devices/stats': {
        get: operation({
          tag: 'Devices',
          summary: 'Fleet counters',
          responses: { 200: json('Counts by status and connection', { type: 'object' }), ...errors(401) },
        }),
      },
      '/v1/devices/types': {
        get: operation({
          tag: 'Devices',
          summary: 'List device types',
          responses: { 200: json('Device types with their declared metrics', { type: 'object' }), ...errors(401) },
        }),
        post: operation({
          tag: 'Devices',
          summary: 'Create a device type',
          description:
            'Requires the admin role or a client with `devices:write`. Declared metrics gate what a device may report.',
          body: jsonBody(devices.createDeviceTypeSchema),
          responses: { 201: json('Created', { type: 'object' }), ...errors(400, 401, 403, 409) },
        }),
      },
      '/v1/devices/{id}': {
        get: operation({
          tag: 'Devices',
          summary: 'Get a device with its state and credentials',
          params: [pathParam('id', 'Device id')],
          responses: {
            200: json('Device', {
              allOf: [ref('Device'), { type: 'object', properties: { state: ref('DeviceState') } }],
            }),
            ...errors(400, 401, 403, 404),
          },
        }),
        patch: operation({
          tag: 'Devices',
          summary: 'Update a device',
          params: [pathParam('id', 'Device id')],
          body: jsonBody(devices.updateDeviceSchema),
          responses: { 200: json('Updated', ref('Device')), ...errors(400, 401, 403, 404) },
        }),
        delete: operation({
          tag: 'Devices',
          summary: 'Decommission a device',
          description: 'Soft deletes the device and revokes every credential it holds.',
          params: [pathParam('id', 'Device id')],
          responses: { 204: { description: 'Decommissioned' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/devices/{id}/simulation': {
        get: operation({
          tag: 'Devices',
          summary: 'Read the simulation state of a device',
          params: [pathParam('id', 'Device id')],
          responses: { 200: json('Simulation state', { type: 'object' }), ...errors(400, 401, 403, 404) },
        }),
        post: operation({
          tag: 'Devices',
          summary: 'Start simulating a device',
          description: 'Generates readings inside each declared metric range and feeds them through the same ingest path a real device uses, so rules, alerts and events all behave normally. Bounded by SIMULATION_MAX_CONCURRENT and stopped automatically at SIMULATION_MAX_DURATION_MS. Refused in production.',
          params: [pathParam('id', 'Device id')],
          body: jsonBody(startSimulationSchema),
          responses: { 200: json('Simulation started', { type: 'object' }), ...errors(400, 401, 403, 404, 409) },
        }),
        delete: operation({
          tag: 'Devices',
          summary: 'Stop simulating a device',
          params: [pathParam('id', 'Device id')],
          responses: { 200: json('Simulation stopped', { type: 'object' }), ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/devices/{id}/credentials': {
        post: operation({
          tag: 'Devices',
          summary: 'Issue a device credential',
          description:
            'Returns the only copy of the token. The previous credential is revoked unless `revokeExisting` is false.',
          params: [pathParam('id', 'Device id')],
          body: jsonBody(devices.rotateCredentialSchema),
          responses: {
            201: json('Issued', { type: 'object', properties: { id: { type: 'string' }, token: { type: 'string' } } }),
            ...errors(400, 401, 403, 404),
          },
        }),
      },
      '/v1/devices/{id}/credentials/{credentialId}': {
        delete: operation({
          tag: 'Devices',
          summary: 'Revoke one credential',
          params: [pathParam('id', 'Device id'), pathParam('credentialId', 'Credential id')],
          responses: { 204: { description: 'Revoked' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/devices/{id}/state/desired': {
        put: operation({
          tag: 'Devices',
          summary: 'Set desired state',
          description: 'The device reads this on its next poll and reports back what it applied.',
          params: [pathParam('id', 'Device id')],
          body: jsonBody(devices.jsonObject, 'Arbitrary desired configuration'),
          responses: { 200: json('Stored', ref('DeviceState')), ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/devices/{id}/latest': {
        get: operation({
          tag: 'Telemetry',
          summary: 'Latest reading per metric',
          params: [pathParam('id', 'Device id')],
          responses: {
            200: json('Latest readings', {
              type: 'object',
              properties: { latest: { type: 'array', items: ref('Reading') } },
            }),
            ...errors(400, 401, 403, 404),
          },
        }),
      },
      '/v1/devices/{id}/series': {
        get: operation({
          tag: 'Telemetry',
          summary: 'Readings for one metric',
          description: 'Returns raw points ascending by time, or aggregated buckets when `bucketSeconds` is supplied.',
          params: [
            pathParam('id', 'Device id'),
            { name: 'metric', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5000, default: 500 } },
            { name: 'bucketSeconds', in: 'query', schema: { type: 'integer', minimum: 10, maximum: 86400 } },
          ],
          responses: {
            200: json('Series', {
              type: 'object',
              properties: { metric: { type: 'string' }, points: { type: 'array', items: ref('Reading') } },
            }),
            ...errors(400, 401, 403, 404),
          },
        }),
      },
      '/v1/devices/{id}/commands': {
        get: operation({
          tag: 'Commands',
          summary: 'List commands for a device',
          params: [
            pathParam('id', 'Device id'),
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: json('Commands', {
              type: 'object',
              properties: { commands: { type: 'array', items: ref('Command') } },
            }),
            ...errors(400, 401, 403, 404),
          },
        }),
        post: operation({
          tag: 'Commands',
          summary: 'Issue a command',
          description: 'Queued until the device polls for it, then expires after its time to live.',
          params: [pathParam('id', 'Device id')],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type'],
                  additionalProperties: false,
                  properties: {
                    type: { type: 'string', examples: ['reboot'] },
                    payload: { type: 'object', additionalProperties: true },
                    ttlSeconds: { type: 'integer', minimum: 10, maximum: 86400 },
                  },
                },
              },
            },
          },
          responses: { 201: json('Queued', ref('Command')), ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/commands/{id}/cancel': {
        post: operation({
          tag: 'Commands',
          summary: 'Cancel a pending command',
          params: [pathParam('id', 'Command id')],
          responses: { 200: json('Cancelled', ref('Command')), ...errors(400, 401, 403, 404, 409) },
        }),
      },
      '/v1/rules': {
        get: operation({
          tag: 'Rules',
          summary: 'List threshold rules',
          description: 'Requires the admin role or a client with `devices:write`.',
          params: [
            { name: 'deviceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'deviceTypeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'metric', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: json('Rules', { type: 'object', properties: { rules: { type: 'array', items: ref('Rule') } } }),
            ...errors(400, 401, 403),
          },
        }),
        post: operation({
          tag: 'Rules',
          summary: 'Create a threshold rule',
          description:
            'Target a device type or a single device. A breach raises an alert unless one is already open inside the cooldown.',
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'metric', 'operator', 'threshold'],
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    deviceTypeId: { type: 'string', format: 'uuid' },
                    deviceId: { type: 'string', format: 'uuid' },
                    metric: { type: 'string' },
                    operator: OPERATOR,
                    threshold: { type: 'number' },
                    severity: SEVERITY,
                    cooldownSeconds: { type: 'integer', minimum: 0, maximum: 86400, default: 300 },
                    enabled: { type: 'boolean', default: true },
                  },
                },
              },
            },
          },
          responses: { 201: json('Created', ref('Rule')), ...errors(400, 401, 403) },
        }),
      },
      '/v1/rules/{id}': {
        patch: operation({
          tag: 'Rules',
          summary: 'Update a rule',
          params: [pathParam('id', 'Rule id')],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    operator: OPERATOR,
                    threshold: { type: 'number' },
                    severity: SEVERITY,
                    cooldownSeconds: { type: 'integer' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { 200: json('Updated', ref('Rule')), ...errors(400, 401, 403, 404) },
        }),
        delete: operation({
          tag: 'Rules',
          summary: 'Delete a rule',
          params: [pathParam('id', 'Rule id')],
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/alerts': {
        get: operation({
          tag: 'Alerts',
          summary: 'List alerts',
          params: [
            { name: 'deviceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'acknowledged', 'resolved'] } },
            { name: 'severity', in: 'query', schema: SEVERITY },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            200: json('Alerts', {
              type: 'object',
              properties: { alerts: { type: 'array', items: ref('Alert') }, nextBefore: { type: ['string', 'null'] } },
            }),
            ...errors(400, 401),
          },
        }),
      },
      '/v1/alerts/stats': {
        get: operation({
          tag: 'Alerts',
          summary: 'Open and critical counts',
          responses: { 200: json('Counters', { type: 'object' }), ...errors(401) },
        }),
      },
      '/v1/alerts/{id}/acknowledge': {
        post: operation({
          tag: 'Alerts',
          summary: 'Acknowledge an alert',
          params: [pathParam('id', 'Alert id')],
          responses: { 200: json('Acknowledged', ref('Alert')), ...errors(400, 401, 403, 404, 409) },
        }),
      },
      '/v1/alerts/{id}/resolve': {
        post: operation({
          tag: 'Alerts',
          summary: 'Resolve an alert',
          description: 'Publishes `iot.alert.resolved` to the event bus.',
          params: [pathParam('id', 'Alert id')],
          responses: { 200: json('Resolved', ref('Alert')), ...errors(400, 401, 403, 404, 409) },
        }),
      },

      '/v1/device/activate': {
        post: operation({
          tag: 'Device plane',
          summary: 'Exchange a claim code for a device token',
          description: 'Called once by the hardware. The claim code is consumed and the device becomes active.',
          security: [],
          body: jsonBody(devices.activateSchema),
          responses: {
            200: json('Activated', {
              type: 'object',
              properties: {
                deviceId: { type: 'string', format: 'uuid' },
                externalId: { type: 'string' },
                token: { type: 'string', description: 'Store this, it is never shown again' },
                ingestUrl: { type: 'string' },
                heartbeatSeconds: { type: 'integer' },
              },
            }),
            ...errors(400, 401, 403, 409, 429),
          },
        }),
      },
      '/v1/device/me': {
        get: operation({
          tag: 'Device plane',
          summary: 'Device identity and declared metrics',
          security: deviceAuth,
          responses: { 200: json('Identity', { type: 'object' }), ...errors(401, 403) },
        }),
        delete: operation({
          tag: 'Device plane',
          summary: 'Revoke the credential in use',
          description: 'Lets a device retire itself without an operator.',
          security: deviceAuth,
          responses: { 204: { description: 'Credential revoked' }, ...errors(401, 403) },
        }),
      },
      '/v1/device/telemetry': {
        post: operation({
          tag: 'Device plane',
          summary: 'Report readings',
          description: [
            'Accepts a batch, a single reading, or a `metrics` map.',
            'Readings are validated against the device type, deduplicated on `(device, metric, timestamp)` and evaluated against the rules engine in one transaction.',
          ].join(' '),
          security: deviceAuth,
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['readings'],
                      properties: { readings: { type: 'array', minItems: 1, items: toSchema(readingSchema) } },
                    },
                    toSchema(readingSchema),
                    {
                      type: 'object',
                      required: ['metrics'],
                      properties: {
                        metrics: { type: 'object', additionalProperties: { type: 'number' } },
                        ts: { type: 'string', format: 'date-time' },
                      },
                    },
                  ],
                },
                examples: {
                  batch: { value: { readings: [{ metric: 'temperature', value: 4.2 }] } },
                  map: { value: { metrics: { temperature: 4.2, humidity: 51 } } },
                },
              },
            },
          },
          responses: { 202: json('Accepted', ref('IngestResult')), ...errors(400, 401, 403, 429) },
        }),
      },
      '/v1/device/heartbeat': {
        post: operation({
          tag: 'Device plane',
          summary: 'Report liveness without readings',
          security: deviceAuth,
          responses: { 200: json('Acknowledged', { type: 'object' }), ...errors(401, 403, 429) },
        }),
      },
      '/v1/device/commands': {
        get: operation({
          tag: 'Device plane',
          summary: 'Claim pending commands',
          description: 'Claimed commands move to `dispatched`. Unacknowledged commands expire.',
          security: deviceAuth,
          params: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 20 } }],
          responses: {
            200: json('Commands', {
              type: 'object',
              properties: { commands: { type: 'array', items: ref('Command') } },
            }),
            ...errors(401, 403),
          },
        }),
      },
      '/v1/device/commands/{id}/ack': {
        post: operation({
          tag: 'Device plane',
          summary: 'Acknowledge a command',
          security: deviceAuth,
          params: [pathParam('id', 'Command id')],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    status: { type: 'string', enum: ['acknowledged', 'failed'], default: 'acknowledged' },
                    result: { type: 'object', additionalProperties: true },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: json('Completed', ref('Command')), ...errors(400, 401, 403, 404, 409) },
        }),
      },
      '/v1/device/state': {
        get: operation({
          tag: 'Device plane',
          summary: 'Read desired state',
          security: deviceAuth,
          responses: {
            200: json('Desired state', {
              type: 'object',
              properties: { desired: { type: 'object' }, desiredVersion: { type: 'integer' } },
            }),
            ...errors(401, 403),
          },
        }),
      },
      '/v1/device/state/reported': {
        put: operation({
          tag: 'Device plane',
          summary: 'Report applied state',
          security: deviceAuth,
          body: jsonBody(devices.jsonObject, 'What the device actually applied'),
          responses: { 200: json('Stored', ref('DeviceState')), ...errors(400, 401, 403) },
        }),
      },
    },
  };
}
