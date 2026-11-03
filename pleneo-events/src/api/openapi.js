import { z } from 'zod';
import { config } from '#config';
import { publishEventSchema } from '#modules/events/events.validators.js';
import { enqueueJobSchema, JOB_STATUSES } from '#modules/jobs/jobs.validators.js';

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
  400: problem('Validation failed'),
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

const operation = ({ tag, summary, description, security, params = [], body, responses }) => ({
  tags: [tag],
  summary,
  description,
  ...(security ? { security } : {}),
  ...(params.length ? { parameters: params } : {}),
  ...(body ? { requestBody: body } : {}),
  responses,
});

const JOB_STATUS = { type: 'string', enum: JOB_STATUSES };

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pleneo Events',
      version: '1.0.0',
      description: [
        'Event bus, job queues, cron scheduler and notification dispatch, backed by Postgres alone.',
        '',
        'Publishing an event and fanning it out happen in one transaction: the event row, a `webhook.deliver` job per matching subscription, and any internal jobs commit together or not at all.',
        '',
        '### Delivery',
        '',
        'Webhook deliveries are signed. Receivers verify `x-pleneo-signature` as `sha256=HMAC(secret, "<timestamp>.<body>")` using `x-pleneo-timestamp`, and should treat a repeated `x-pleneo-event-id` as a no-op.',
        'A 4xx other than 408, 425 and 429 is final, a 410 pauses the subscription, and anything else retries with exponential backoff until the attempt ceiling, after which the job is dead-lettered.',
        '',
        '### Idempotency',
        '',
        'Supply `idempotencyKey` when publishing an event or enqueueing a job. A replay returns 200 with the original id instead of creating a duplicate.',
      ].join('\n'),
    },
    servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local' }],
    tags: [
      { name: 'System', description: 'Liveness, readiness and advertised capabilities' },
      { name: 'Events', description: 'Publishing to the bus' },
      { name: 'Jobs', description: 'Enqueueing work' },
      { name: 'Ingest', description: 'Signed inbound webhooks from other services' },
      { name: 'Operations', description: 'Queue console: jobs, events, subscriptions and schedules' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'authzero access token' },
        authzeroSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'x-authzero-signature',
          description: 'HMAC SHA-256 of `<timestamp>.<body>` keyed with the shared authzero webhook secret',
        },
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
            errors: { type: 'array', items: { type: 'object' } },
          },
          required: ['type', 'title', 'status', 'code', 'detail'],
        },
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', examples: ['project.created'] },
            source: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
            occurred_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            queue: { type: 'string' },
            type: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
            status: JOB_STATUS,
            priority: { type: 'integer' },
            attempts: { type: 'integer' },
            max_attempts: { type: 'integer' },
            run_at: { type: 'string', format: 'date-time' },
            last_error: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Subscription: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            event_types: { type: 'array', items: { type: 'string', examples: ['project.*'] } },
            status: { type: 'string', enum: ['active', 'paused'] },
            deliveries24h: { type: 'object', additionalProperties: { type: 'integer' } },
          },
        },
        Schedule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            cron: { type: 'string', examples: ['*/5 * * * *'] },
            timezone: { type: 'string', examples: ['UTC'] },
            queue: { type: 'string' },
            job_type: { type: 'string' },
            enabled: { type: 'boolean' },
            next_run_at: { type: 'string', format: 'date-time' },
            last_run_at: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: operation({
          tag: 'System',
          summary: 'Liveness probe',
          security: [],
          responses: { 200: json('Process is up', { type: 'object' }) },
        }),
      },
      '/ready': {
        get: operation({
          tag: 'System',
          summary: 'Readiness probe',
          security: [],
          responses: {
            200: json('Ready', { type: 'object' }),
            503: json('Dependencies unavailable', { type: 'object' }),
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
          summary: 'Registered job types, email templates and queues',
          security: [],
          responses: { 200: json('Capabilities', { type: 'object' }) },
        }),
      },

      '/events': {
        post: operation({
          tag: 'Events',
          summary: 'Publish an event',
          description:
            'Requires a client with `events:publish` or an admin user. Fan-out to subscriptions happens in the same transaction.',
          body: jsonBody(publishEventSchema),
          responses: {
            202: json('Published', {
              type: 'object',
              properties: {
                eventId: { type: 'string', format: 'uuid' },
                duplicate: { type: 'boolean' },
                deliveries: { type: 'integer', description: 'Matching subscriptions queued' },
                internal: { type: 'array', items: { type: 'string' } },
              },
            }),
            200: json('Idempotent replay of an event already published', { type: 'object' }),
            ...errors(400, 401, 403, 429),
          },
        }),
      },
      '/jobs': {
        post: operation({
          tag: 'Jobs',
          summary: 'Enqueue a job',
          description:
            'Requires a client with `jobs:enqueue` or an admin user. The job type must have a registered handler.',
          body: jsonBody(enqueueJobSchema),
          responses: {
            202: json('Queued', {
              type: 'object',
              properties: {
                jobId: { type: 'string', format: 'uuid' },
                status: JOB_STATUS,
                runAt: { type: 'string', format: 'date-time' },
                duplicate: { type: 'boolean' },
              },
            }),
            200: json('Idempotent replay of a job already queued', { type: 'object' }),
            ...errors(400, 401, 403, 429),
          },
        }),
      },
      '/ingest/authzero': {
        post: operation({
          tag: 'Ingest',
          summary: 'Receive the authzero outbox webhook',
          description:
            'The signature is verified before the body is parsed. Accepted envelopes are republished as `auth.<type>` events.',
          security: [{ authzeroSignature: [] }],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'type'],
                  properties: {
                    id: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
                    type: { type: 'string', examples: ['user.registered'] },
                    payload: { type: 'object', additionalProperties: true },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            202: json('Accepted and republished', { type: 'object' }),
            200: json('Already ingested', { type: 'object' }),
            ...errors(400, 401, 429),
          },
        }),
      },

      '/admin/stats': {
        get: operation({
          tag: 'Operations',
          summary: 'Queue depths, throughput and registered handlers',
          description: 'Requires the admin role or a client with `events:manage`.',
          responses: { 200: json('Statistics', { type: 'object' }), ...errors(401, 403) },
        }),
      },
      '/admin/jobs': {
        get: operation({
          tag: 'Operations',
          summary: 'List jobs',
          params: [
            { name: 'status', in: 'query', schema: JOB_STATUS },
            { name: 'queue', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 25 } },
          ],
          responses: {
            200: json('Jobs', {
              type: 'object',
              properties: { jobs: { type: 'array', items: ref('Job') }, nextBefore: { type: ['string', 'null'] } },
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
      '/admin/jobs/{id}': {
        get: operation({
          tag: 'Operations',
          summary: 'Get a job with its attempt history',
          params: [pathParam('id', 'Job id')],
          responses: { 200: json('Job', ref('Job')), ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/jobs/{id}/retry': {
        post: operation({
          tag: 'Operations',
          summary: 'Retry a dead or failed job',
          description: 'Resets the attempt counter and schedules the job immediately.',
          params: [pathParam('id', 'Job id')],
          responses: { 200: json('Requeued', ref('Job')), ...errors(400, 401, 403, 404, 409) },
        }),
      },
      '/admin/jobs/{id}/cancel': {
        post: operation({
          tag: 'Operations',
          summary: 'Cancel a pending job',
          params: [pathParam('id', 'Job id')],
          responses: { 200: json('Cancelled', ref('Job')), ...errors(400, 401, 403, 404, 409) },
        }),
      },
      '/admin/events': {
        get: operation({
          tag: 'Operations',
          summary: 'List recent events',
          params: [
            {
              name: 'type',
              in: 'query',
              description: 'Exact type or a `prefix.*` pattern',
              schema: { type: 'string' },
            },
            { name: 'source', in: 'query', schema: { type: 'string' } },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 25 } },
          ],
          responses: {
            200: json('Events', { type: 'object', properties: { events: { type: 'array', items: ref('Event') } } }),
            ...errors(400, 401, 403),
          },
        }),
      },
      '/admin/events/{id}': {
        get: operation({
          tag: 'Operations',
          summary: 'Get an event and its delivery attempts',
          params: [pathParam('id', 'Event id')],
          responses: { 200: json('Event with deliveries', ref('Event')), ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/subscriptions': {
        get: operation({
          tag: 'Operations',
          summary: 'List webhook subscriptions',
          responses: {
            200: json('Subscriptions', {
              type: 'object',
              properties: { subscriptions: { type: 'array', items: ref('Subscription') } },
            }),
            ...errors(401, 403),
          },
        }),
        post: operation({
          tag: 'Operations',
          summary: 'Create a subscription',
          description: 'Returns the signing secret once. Omit `secret` to have one generated.',
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'url', 'eventTypes'],
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,63}$' },
                    description: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    secret: { type: 'string', minLength: 32 },
                    eventTypes: { type: 'array', minItems: 1, items: { type: 'string', examples: ['project.*'] } },
                  },
                },
              },
            },
          },
          responses: { 201: json('Created', ref('Subscription')), ...errors(400, 401, 403, 409) },
        }),
      },
      '/admin/subscriptions/{id}': {
        patch: operation({
          tag: 'Operations',
          summary: 'Update or pause a subscription',
          params: [pathParam('id', 'Subscription id')],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    description: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    secret: { type: 'string', minLength: 32 },
                    eventTypes: { type: 'array', items: { type: 'string' } },
                    status: { type: 'string', enum: ['active', 'paused'] },
                  },
                },
              },
            },
          },
          responses: { 200: json('Updated', ref('Subscription')), ...errors(400, 401, 403, 404) },
        }),
        delete: operation({
          tag: 'Operations',
          summary: 'Delete a subscription',
          params: [pathParam('id', 'Subscription id')],
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/schedules': {
        get: operation({
          tag: 'Operations',
          summary: 'List cron schedules',
          responses: {
            200: json('Schedules', {
              type: 'object',
              properties: { schedules: { type: 'array', items: ref('Schedule') } },
            }),
            ...errors(401, 403),
          },
        }),
        post: operation({
          tag: 'Operations',
          summary: 'Create a cron schedule',
          description: 'Each firing enqueues the job idempotently for its slot, so a restart cannot double-fire.',
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'cron', 'jobType'],
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    cron: { type: 'string', examples: ['0 2 * * *'] },
                    timezone: { type: 'string', default: 'UTC' },
                    queue: { type: 'string', default: 'default' },
                    jobType: { type: 'string' },
                    payload: { type: 'object', additionalProperties: true },
                    enabled: { type: 'boolean', default: true },
                  },
                },
              },
            },
          },
          responses: { 201: json('Created', ref('Schedule')), ...errors(400, 401, 403) },
        }),
      },
      '/admin/schedules/{id}': {
        patch: operation({
          tag: 'Operations',
          summary: 'Update, pause or resume a schedule',
          params: [pathParam('id', 'Schedule id')],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    description: { type: 'string' },
                    cron: { type: 'string' },
                    timezone: { type: 'string' },
                    queue: { type: 'string' },
                    jobType: { type: 'string' },
                    payload: { type: 'object', additionalProperties: true },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { 200: json('Updated', ref('Schedule')), ...errors(400, 401, 403, 404) },
        }),
        delete: operation({
          tag: 'Operations',
          summary: 'Delete a schedule',
          params: [pathParam('id', 'Schedule id')],
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/schedules/{id}/run': {
        post: operation({
          tag: 'Operations',
          summary: 'Run a schedule now',
          description: 'Enqueues the job immediately at raised priority without changing the cron slot.',
          params: [pathParam('id', 'Schedule id')],
          responses: {
            202: json('Queued', { type: 'object', properties: { jobId: { type: 'string', format: 'uuid' } } }),
            ...errors(400, 401, 403, 404),
          },
        }),
      },
    },
  };
}
