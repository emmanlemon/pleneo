import { z } from 'zod';
import { config } from '#config';
import * as bff from '#modules/bff/bff.routes.js';
import { testEmailSchema } from '#modules/email/email.routes.js';
import { createProjectSchema, PROJECT_STATUSES, projectListQuery, updateProjectSchema } from '#modules/projects/index.js';

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

export const SOCKET_EVENTS = {
  'notification:new': 'A notification was created for the connected user.',
  'notification:read': 'One notification, or every notification, was marked read.',
  'event:received': 'An inbound platform event was accepted, carrying its type and subject ids.',
};

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pleneo Management',
      version: '1.0.0',
      description: [
        'Projects, notifications and the inbound event webhook for the Pleneo console.',
        '',
        'Writes are published through a transactional outbox: the row and its event are committed together, then a relay forwards the event to pleneo-events.',
        'Events come back over a signed webhook, which turns them into notifications and pushes them to connected browsers over Socket.IO.',
        '',
        '### Realtime',
        '',
        `Socket.IO is served from the same origin at \`${config.SOCKET_PATH}\`. Clients authenticate in the handshake with the same authzero access token used for REST, passed as \`auth.token\`. Each connection joins a private room for its user, so a client only ever receives its own notifications.`,
        '',
        Object.entries(SOCKET_EVENTS)
          .map(([name, description]) => `- \`${name}\` — ${description}`)
          .join('\n'),
      ].join('\n'),
    },
    servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local' }],
    tags: [
      { name: 'System', description: 'Liveness, readiness and the API document' },
      { name: 'Projects', description: 'Project records owned by a user' },
      { name: 'Notifications', description: 'Per-user inbox backing the console bell' },
      { name: 'BFF', description: 'Session endpoints: the browser holds a cookie, never a token' },
      { name: 'Gateway', description: 'Resources this service proxies; the caller cannot tell which are local' },
      { name: 'Admin', description: 'Operator tools behind the admin role' },
      { name: 'Webhooks', description: 'Signed inbound events from pleneo-events' },
    ],
    'x-socketio': { path: config.SOCKET_PATH, auth: 'handshake auth.token', events: SOCKET_EVENTS },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'authzero access token' },
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: config.BFF_COOKIE_NAME,
          description: 'httpOnly session cookie issued by /bff/auth/login. The browser never sees an access token.',
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'Echoed from the readable CSRF cookie; required on every mutating request made with the session cookie.',
        },
        webhookSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'x-pleneo-signature',
          description:
            'HMAC SHA-256 of `<timestamp>.<body>` keyed with the subscription secret, sent with `x-pleneo-timestamp`',
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
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            owner_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: PROJECT_STATUSES },
            starts_on: { type: ['string', 'null'], format: 'date' },
            ends_on: { type: ['string', 'null'], format: 'date' },
            created_by: { type: 'string', format: 'uuid' },
            updated_by: { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            allowed_transitions: {
              type: 'array',
              description: 'Statuses this project may move to next, including its current one.',
              items: { type: 'string', enum: PROJECT_STATUSES },
            },
          },
        },
        Profile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: ['string', 'null'] },
            roles: { type: 'array', items: { type: 'string' } },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            type: { type: 'string', examples: ['iot.alert.raised'] },
            title: { type: 'string' },
            body: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
            read_at: { type: ['string', 'null'], format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
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

      '/v1/projects': {
        get: operation({
          tag: 'Projects',
          summary: 'List projects',
          description: 'Users see their own projects. Admins and clients with `projects:read` see every project.',
          params: queryParams(projectListQuery),
          responses: {
            200: json('A page of projects', {
              type: 'object',
              properties: {
                projects: { type: 'array', items: ref('Project') },
                nextCursor: { type: ['string', 'null'] },
              },
            }),
            ...errors(400, 401),
          },
        }),
        post: operation({
          tag: 'Projects',
          summary: 'Create a project',
          description: 'Writes the project and a `project.created` outbox row in one transaction.',
          body: jsonBody(createProjectSchema),
          responses: { 201: json('Created', ref('Project')), ...errors(400, 401, 403) },
        }),
      },
      '/v1/projects/summary': {
        get: operation({
          tag: 'Projects',
          summary: 'Portfolio summary',
          description:
            'Counts by status over the projects the caller can see, how many open projects are past their end date, and the open projects ending soonest, overdue first.',
          responses: {
            200: json('Portfolio summary', {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                byStatus: {
                  type: 'object',
                  properties: Object.fromEntries(PROJECT_STATUSES.map((status) => [status, { type: 'integer' }])),
                },
                overdue: { type: 'integer' },
                horizonDays: { type: 'integer' },
                dueSoon: { type: 'array', items: ref('Project') },
              },
            }),
            ...errors(401),
          },
        }),
      },
      '/v1/projects/{id}': {
        get: operation({
          tag: 'Projects',
          summary: 'Get a project',
          params: [pathParam('id', 'Project id')],
          responses: { 200: json('Project', ref('Project')), ...errors(400, 401, 403, 404) },
        }),
        patch: operation({
          tag: 'Projects',
          summary: 'Update a project',
          description:
            'Emits `project.status_changed` when the status moves, otherwise `project.updated`. A status move that the lifecycle forbids is refused with 409; `allowed_transitions` on the project says which moves are open.',
          params: [pathParam('id', 'Project id')],
          body: jsonBody(updateProjectSchema),
          responses: { 200: json('Updated', ref('Project')), ...errors(400, 401, 403, 404, 409) },
        }),
        delete: operation({
          tag: 'Projects',
          summary: 'Delete a project',
          description: 'Soft deletes the project and emits `project.deleted`.',
          params: [pathParam('id', 'Project id')],
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404) },
        }),
      },

      '/v1/notifications': {
        get: operation({
          tag: 'Notifications',
          summary: 'List the caller’s notifications',
          params: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'unread', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          ],
          responses: {
            200: json('Notifications', {
              type: 'object',
              properties: {
                notifications: { type: 'array', items: ref('Notification') },
                nextBefore: { type: ['string', 'null'] },
              },
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
      '/v1/notifications/unread-count': {
        get: operation({
          tag: 'Notifications',
          summary: 'Unread count for the bell badge',
          responses: {
            200: json('Count', { type: 'object', properties: { count: { type: 'integer' } } }),
            ...errors(401, 403),
          },
        }),
      },
      '/v1/notifications/read-all': {
        post: operation({
          tag: 'Notifications',
          summary: 'Mark every notification read',
          responses: {
            200: json('How many were updated', { type: 'object', properties: { updated: { type: 'integer' } } }),
            ...errors(401, 403),
          },
        }),
      },
      '/v1/notifications/{id}/read': {
        post: operation({
          tag: 'Notifications',
          summary: 'Mark one notification read',
          params: [pathParam('id', 'Notification id')],
          responses: { 200: json('Updated', ref('Notification')), ...errors(400, 401, 403, 404) },
        }),
      },
      '/v1/notifications/{id}': {
        delete: operation({
          tag: 'Notifications',
          summary: 'Delete one notification',
          params: [pathParam('id', 'Notification id')],
          responses: { 204: { description: 'Deleted' }, ...errors(400, 401, 403, 404) },
        }),
      },

      '/v1/auth/login': {
        post: operation({
          tag: 'BFF',
          summary: 'Sign in and open a browser session',
          description:
            'Calls the identity provider server side. On success the tokens stay here and the browser receives only the session and CSRF cookies. A account with MFA gets a challenge instead, and no session is opened until it is answered.',
          security: [],
          body: jsonBody(bff.loginSchema),
          responses: {
            200: json('Session opened, or an MFA challenge', {
              oneOf: [
                { type: 'object', properties: { mfaRequired: { type: 'boolean', enum: [false] }, user: ref('Profile'), csrfToken: { type: 'string' } } },
                { type: 'object', properties: { mfaRequired: { type: 'boolean', enum: [true] }, mfaToken: { type: 'string' }, expiresIn: { type: 'integer' } } },
              ],
            }),
            ...errors(400, 401, 403, 429),
            423: problem('Account temporarily locked'),
            503: problem('The identity provider is unreachable'),
          },
        }),
      },
      '/v1/auth/login/mfa': {
        post: operation({
          tag: 'BFF',
          summary: 'Answer the MFA challenge and open a session',
          security: [],
          body: jsonBody(bff.mfaSchema),
          responses: {
            200: json('Session opened', { type: 'object', properties: { user: ref('Profile'), csrfToken: { type: 'string' } } }),
            ...errors(400, 401, 429),
          },
        }),
      },
      '/v1/auth/session': {
        get: operation({
          tag: 'BFF',
          summary: 'Who the session belongs to',
          description: 'The browser calls this on load to restore state. Returns 401 when no usable session cookie is present.',
          security: [{ sessionCookie: [] }],
          responses: { 200: json('Current user', { type: 'object', properties: { user: ref('Profile') } }), ...errors(401, 403) },
        }),
      },
      '/v1/auth/logout': {
        post: operation({
          tag: 'BFF',
          summary: 'Close the session',
          description: 'Revokes the stored session, tells the provider to revoke its own, and clears both cookies. Safe to call without a session.',
          security: [],
          responses: { 204: { description: 'Signed out' } },
        }),
      },
      '/v1/auth/register': {
        post: operation({
          tag: 'BFF',
          summary: 'Register an account',
          security: [],
          body: jsonBody(bff.registerSchema),
          responses: { 202: json('Accepted', { type: 'object' }), ...errors(400, 429) },
        }),
      },
      '/v1/auth/email/verify': {
        post: operation({
          tag: 'BFF',
          summary: 'Verify an email address',
          security: [],
          body: jsonBody(bff.verifyEmailSchema),
          responses: { 200: json('Verified', { type: 'object' }), ...errors(400, 401, 429) },
        }),
      },
      '/v1/auth/email/resend': {
        post: operation({
          tag: 'BFF',
          summary: 'Resend the verification email',
          security: [],
          body: jsonBody(bff.emailOnlySchema),
          responses: { 202: json('Accepted', { type: 'object' }), ...errors(400, 429) },
        }),
      },
      '/v1/auth/password/forgot': {
        post: operation({
          tag: 'BFF',
          summary: 'Request a password reset',
          security: [],
          body: jsonBody(bff.emailOnlySchema),
          responses: { 202: json('Accepted', { type: 'object' }), ...errors(400, 429) },
        }),
      },
      '/v1/auth/password/reset': {
        post: operation({
          tag: 'BFF',
          summary: 'Reset a password with a token',
          security: [],
          body: jsonBody(bff.resetPasswordSchema),
          responses: { 200: json('Updated', { type: 'object' }), ...errors(400, 401, 429) },
        }),
      },
      '/v1/auth/invitations/accept': {
        post: operation({
          tag: 'BFF',
          summary: 'Accept an invitation and set the first password',
          security: [],
          body: jsonBody(bff.resetPasswordSchema),
          responses: { 200: json('Activated', { type: 'object' }), ...errors(400, 401, 429) },
        }),
      },
      '/v1/auth/password/change': {
        post: operation({
          tag: 'BFF',
          summary: 'Change the signed-in user’s password',
          security: [{ sessionCookie: [], csrfToken: [] }],
          body: jsonBody(bff.changePasswordSchema),
          responses: { 200: json('Updated', { type: 'object' }), ...errors(400, 401, 403, 429) },
        }),
      },
      '/v1/queues/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: "Proxy a queue console call",
          description: "Forwarded to the queue service. Only allowlisted paths are forwarded; anything else is 404 and never reaches the upstream. Reads retry with jittered backoff, and a circuit breaker short-circuits a failing upstream.",
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/devices/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: "Proxy a device call",
          description: "Forwarded to the device service. The device ingest plane is deliberately absent from the allowlist.",
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/commands/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: "Proxy a command call",
          description: "Forwarded to the device service.",
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/alerts/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: "Proxy an alert call",
          description: "Forwarded to the device service.",
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/rules/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: "Proxy a rule call",
          description: "Forwarded to the device service.",
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/users/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: 'Proxy a user administration call',
          description:
            'Forwarded to the identity provider with the caller’s own access token, so it applies its `users:*` and `roles:manage` checks itself. Invitations, status, lockouts, sessions and role grants.',
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/roles/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: 'Proxy a role catalogue call',
          description: 'Forwarded to the identity provider.',
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/clients/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: 'Proxy an API client call',
          description: 'Forwarded to the identity provider. Requires `clients:manage` there.',
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },
      '/v1/audit/{path}': {
        get: operation({
          tag: 'Gateway',
          summary: 'Proxy an audit log call',
          description: 'Forwarded to the identity provider. Requires `audit:read` there.',
          security: [{ sessionCookie: [] }],
          params: [{ name: 'path', in: 'path', required: true, description: 'An allowlisted path', schema: { type: 'string' } }],
          responses: {
            200: json('Whatever the upstream returned', { type: 'object' }),
            ...errors(401, 403, 404, 429),
            503: problem('The upstream is unreachable or its circuit breaker is open'),
          },
        }),
      },

      '/v1/admin/gateway': {
        get: operation({
          tag: 'BFF',
          summary: 'Gateway health and traffic counters',
          description: 'Per-upstream request counts, status classes, retries, latency and circuit breaker state. Admin role required.',
          security: [{ sessionCookie: [] }, { bearerAuth: [] }],
          responses: { 200: json('Gateway status', { type: 'object' }), ...errors(401, 403) },
        }),
      },

      '/v1/admin/email/test': {
        post: operation({
          tag: 'Admin',
          summary: 'Send a test email through the real pipeline',
          description:
            'Enqueues an `email.send` job on pleneo-events using the `system.test-email` template, so the message travels the same path a real notification takes and lands with whatever provider that service is configured for. Returns the job id; poll it through the queue console to see the delivery outcome. Admin role required.',
          security: [{ sessionCookie: [] }, { bearerAuth: [] }],
          body: jsonBody(testEmailSchema),
          responses: {
            202: json('Queued', { type: 'object' }),
            ...errors(400, 401, 403, 429),
            503: problem('pleneo-events is unreachable'),
          },
        }),
      },

      '/v1/webhooks/events': {
        post: operation({
          tag: 'Webhooks',
          summary: 'Receive a signed platform event',
          description: [
            'Called by pleneo-events. The signature is verified before the body is parsed, and the event id is recorded so redelivery is a no-op.',
            'Handled events create a notification and are pushed to the owner over Socket.IO.',
          ].join(' '),
          security: [{ webhookSignature: [] }],
          body: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'type'],
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    type: { type: 'string', examples: ['iot.alert.raised'] },
                    source: { type: 'string' },
                    occurredAt: { type: 'string', format: 'date-time' },
                    payload: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            202: json('Handled', { type: 'object', properties: { outcome: { type: 'string', enum: ['handled'] } } }),
            200: json('Duplicate or unhandled event type', {
              type: 'object',
              properties: { outcome: { type: 'string', enum: ['duplicate', 'ignored'] } },
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
    },
  };
}
