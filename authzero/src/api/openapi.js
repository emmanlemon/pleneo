import { z } from 'zod';
import { config } from '#config';
import * as r from '#common/validation/rules.js';

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
  423: problem('Account temporarily locked after repeated failures'),
  429: problem('Rate limited'),
};
const errors = (...codes) => Object.fromEntries(codes.map((code) => [code, ERRORS[code]]));

const pathParam = (name, description, schema = { type: 'string', format: 'uuid' }) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema,
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

const accepted = (description) => json(description, { type: 'object', properties: { message: { type: 'string' } } });

const bodies = {
  register: r.strictObject({ email: r.email, password: r.password, name: r.displayName.optional() }),
  login: r.strictObject({ email: r.email, password: r.rawPassword }),
  loginMfa: r.strictObject({ mfaToken: r.jwt, code: r.mfaCode }),
  refresh: r.strictObject({ refreshToken: r.opaqueToken.optional() }),
  emailOnly: r.strictObject({ email: r.email }),
  verifyEmail: r.strictObject({ token: r.opaqueToken }),
  resetPassword: r.strictObject({ token: r.opaqueToken, password: r.password }),
  changePassword: r.strictObject({ currentPassword: r.rawPassword, newPassword: r.password }),
  mfaEnable: r.strictObject({ code: r.totpCode }),
  mfaDisable: r.strictObject({ password: r.rawPassword, code: r.mfaCode }),
  reauth: r.strictObject({ password: r.rawPassword }),
  updateProfile: r.strictObject({ name: r.displayName.optional() }),
  createClient: r.strictObject({ name: r.displayName, scopes: z.array(r.scope).max(50).default([]) }),
  grantRole: r.strictObject({ role: r.roleName }),
  setStatus: r.strictObject({ status: z.enum(['active', 'disabled']) }),
};

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'authzero',
      version: '1.0.0',
      description: [
        'Identity for the Pleneo platform: users, sessions, multi-factor authentication, OAuth2 client credentials and signing keys.',
        '',
        '### Tokens',
        '',
        'Access tokens are short-lived RS256 JWTs signed with keys published at `/.well-known/jwks.json`. Verify `iss`, `aud` and the header `typ` of `at+jwt`.',
        'Every access token is bound to a server-side session, so a logout, password change, role change or admin revocation takes effect immediately rather than at expiry.',
        '',
        'Refresh tokens are opaque, stored hashed, and rotated on every use. Replaying a rotated refresh token revokes the entire session family, which turns token theft into a detected, contained incident.',
        '',
        '### Responses that stay deliberately vague',
        '',
        'Registration, password reset and verification resend always answer 202 whether or not the address exists. This is intentional, so the API cannot be used to enumerate accounts.',
      ].join('\n'),
    },
    servers: [{ url: config.JWT_ISSUER, description: 'Issuer' }],
    tags: [
      { name: 'System', description: 'Probes and key discovery' },
      { name: 'Authentication', description: 'Register, sign in, refresh and sign out' },
      { name: 'Password', description: 'Reset and change flows' },
      { name: 'MFA', description: 'TOTP enrolment and recovery codes' },
      { name: 'Sessions', description: 'The caller’s own sessions' },
      { name: 'Profile', description: 'The caller’s own account' },
      { name: 'OAuth2', description: 'Service to service tokens and introspection' },
      { name: 'Administration', description: 'User, role, client and key management' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token issued by this service',
        },
        basicAuth: { type: 'http', scheme: 'basic', description: 'Client id and secret for the OAuth2 endpoints' },
      },
      schemas: {
        Problem: {
          type: 'object',
          description: 'RFC 7807 problem details',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            code: { type: 'string', examples: ['INVALID_CREDENTIALS'] },
            detail: { type: 'string' },
            instance: { type: 'string' },
            requestId: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
          required: ['type', 'title', 'status', 'code', 'detail'],
        },
        TokenSet: {
          type: 'object',
          properties: {
            mfaRequired: { type: 'boolean', enum: [false] },
            tokenType: { type: 'string', enum: ['Bearer'] },
            accessToken: { type: 'string' },
            expiresIn: { type: 'integer' },
            refreshToken: { type: 'string', description: 'Also set as an httpOnly cookie scoped to /auth' },
            refreshExpiresAt: { type: 'string', format: 'date-time' },
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        MfaChallenge: {
          type: 'object',
          properties: {
            mfaRequired: { type: 'boolean', enum: [true] },
            mfaToken: { type: 'string', description: 'Short-lived token presented to /auth/login/mfa' },
            expiresIn: { type: 'integer' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            email_verified: { type: 'boolean' },
            name: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['active', 'disabled'] },
            mfa_enabled: { type: 'boolean' },
            roles: { type: 'array', items: { type: 'string' } },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            ip: { type: ['string', 'null'] },
            user_agent: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            last_used_at: { type: ['string', 'null'], format: 'date-time' },
            expires_at: { type: 'string', format: 'date-time' },
            current: { type: 'boolean' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            client_id: { type: 'string' },
            name: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'revoked'] },
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
      '/.well-known/jwks.json': {
        get: operation({
          tag: 'System',
          summary: 'Public signing keys',
          description:
            'Retired keys stay published for a grace window so tokens signed just before a rotation still verify.',
          security: [],
          responses: {
            200: json('JSON Web Key Set', {
              type: 'object',
              properties: { keys: { type: 'array', items: { type: 'object' } } },
            }),
          },
        }),
      },
      '/.well-known/openid-configuration': {
        get: operation({
          tag: 'System',
          summary: 'Discovery document',
          security: [],
          responses: { 200: json('Issuer metadata', { type: 'object' }) },
        }),
      },

      '/auth/register': {
        post: operation({
          tag: 'Authentication',
          summary: 'Register an account',
          description:
            'Always answers 202, whether or not the address was free, so the endpoint cannot enumerate accounts.',
          security: [],
          body: jsonBody(bodies.register),
          responses: { 202: accepted('Registration accepted'), ...errors(400, 429) },
        }),
      },
      '/auth/login': {
        post: operation({
          tag: 'Authentication',
          summary: 'Sign in with a password',
          description:
            'Returns tokens, or an MFA challenge when the account has TOTP enabled. Repeated failures lock the account.',
          security: [],
          body: jsonBody(bodies.login),
          responses: {
            200: json('Tokens, or a challenge', { oneOf: [ref('TokenSet'), ref('MfaChallenge')] }),
            ...errors(400, 401, 403, 423, 429),
          },
        }),
      },
      '/auth/login/mfa': {
        post: operation({
          tag: 'Authentication',
          summary: 'Complete the MFA challenge',
          description: 'Accepts a six digit TOTP code or a single-use recovery code.',
          security: [],
          body: jsonBody(bodies.loginMfa),
          responses: { 200: json('Tokens', ref('TokenSet')), ...errors(400, 401, 423, 429) },
        }),
      },
      '/auth/refresh': {
        post: operation({
          tag: 'Authentication',
          summary: 'Rotate the refresh token',
          description:
            'Reads the token from the body or the httpOnly cookie. Replaying an already rotated token revokes the whole session family.',
          security: [],
          body: jsonBody(bodies.refresh),
          responses: { 200: json('A new token set', ref('TokenSet')), ...errors(400, 401, 403, 429) },
        }),
      },
      '/auth/logout': {
        post: operation({
          tag: 'Authentication',
          summary: 'Revoke the current session',
          responses: { 204: { description: 'Signed out' }, ...errors(401, 403) },
        }),
      },
      '/auth/logout-all': {
        post: operation({
          tag: 'Authentication',
          summary: 'Revoke every session for the caller',
          responses: { 204: { description: 'All sessions revoked' }, ...errors(401, 403) },
        }),
      },
      '/auth/email/verify': {
        post: operation({
          tag: 'Authentication',
          summary: 'Verify an email address',
          security: [],
          body: jsonBody(bodies.verifyEmail),
          responses: { 200: accepted('Email verified'), ...errors(400, 401, 429) },
        }),
      },
      '/auth/email/resend': {
        post: operation({
          tag: 'Authentication',
          summary: 'Resend the verification email',
          security: [],
          body: jsonBody(bodies.emailOnly),
          responses: { 202: accepted('Accepted whether or not the account exists'), ...errors(400, 429) },
        }),
      },

      '/auth/password/forgot': {
        post: operation({
          tag: 'Password',
          summary: 'Request a password reset',
          security: [],
          body: jsonBody(bodies.emailOnly),
          responses: { 202: accepted('Accepted whether or not the account exists'), ...errors(400, 429) },
        }),
      },
      '/auth/password/reset': {
        post: operation({
          tag: 'Password',
          summary: 'Reset a password with a token',
          description: 'Consumes the single-use token and revokes every existing session.',
          security: [],
          body: jsonBody(bodies.resetPassword),
          responses: { 200: accepted('Password updated'), ...errors(400, 401, 429) },
        }),
      },
      '/auth/password/change': {
        post: operation({
          tag: 'Password',
          summary: 'Change the caller’s password',
          description:
            'Requires the current password and signs out every other session. Recent passwords are rejected.',
          body: jsonBody(bodies.changePassword),
          responses: { 200: accepted('Password updated'), ...errors(400, 401, 403, 429) },
        }),
      },

      '/auth/mfa/setup': {
        post: operation({
          tag: 'MFA',
          summary: 'Begin TOTP enrolment',
          description: 'Returns the shared secret and an otpauth URL. Enrolment is not active until confirmed.',
          responses: {
            200: json('Provisioning details', {
              type: 'object',
              properties: { secret: { type: 'string' }, otpauthUrl: { type: 'string' } },
            }),
            ...errors(401, 403, 409, 429),
          },
        }),
      },
      '/auth/mfa/enable': {
        post: operation({
          tag: 'MFA',
          summary: 'Confirm TOTP enrolment',
          description: 'Returns ten single-use recovery codes, shown once.',
          body: jsonBody(bodies.mfaEnable),
          responses: {
            200: json('Recovery codes', {
              type: 'object',
              properties: { recoveryCodes: { type: 'array', items: { type: 'string' } } },
            }),
            ...errors(400, 401, 403, 409, 429),
          },
        }),
      },
      '/auth/mfa/disable': {
        post: operation({
          tag: 'MFA',
          summary: 'Disable MFA',
          description:
            'Requires the password and a valid code, so a stolen session alone cannot remove the second factor.',
          body: jsonBody(bodies.mfaDisable),
          responses: { 204: { description: 'Disabled' }, ...errors(400, 401, 403, 409, 429) },
        }),
      },
      '/auth/mfa/recovery-codes': {
        post: operation({
          tag: 'MFA',
          summary: 'Regenerate recovery codes',
          body: jsonBody(bodies.reauth),
          responses: {
            200: json('New recovery codes', {
              type: 'object',
              properties: { recoveryCodes: { type: 'array', items: { type: 'string' } } },
            }),
            ...errors(400, 401, 403, 409, 429),
          },
        }),
      },

      '/auth/sessions': {
        get: operation({
          tag: 'Sessions',
          summary: 'List the caller’s active sessions',
          responses: {
            200: json('Sessions', {
              type: 'object',
              properties: { sessions: { type: 'array', items: ref('Session') } },
            }),
            ...errors(401, 403),
          },
        }),
      },
      '/auth/sessions/{id}': {
        delete: operation({
          tag: 'Sessions',
          summary: 'Revoke one of the caller’s sessions',
          params: [pathParam('id', 'Session id')],
          responses: { 204: { description: 'Revoked' }, ...errors(400, 401, 403, 404) },
        }),
      },

      '/users/me': {
        get: operation({
          tag: 'Profile',
          summary: 'Get the caller’s profile',
          responses: { 200: json('Profile', ref('User')), ...errors(401, 403, 404) },
        }),
        patch: operation({
          tag: 'Profile',
          summary: 'Update the caller’s profile',
          body: jsonBody(bodies.updateProfile),
          responses: { 200: json('Updated', ref('User')), ...errors(400, 401, 403) },
        }),
      },

      '/oauth/token': {
        post: operation({
          tag: 'OAuth2',
          summary: 'Client credentials grant',
          description:
            'Accepts client_secret_basic or client_secret_post, as form or JSON. Requested scopes must be a subset of the client’s grant.',
          security: [{ basicAuth: [] }, {}],
          body: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['grant_type'],
                  properties: {
                    grant_type: { type: 'string', enum: ['client_credentials'] },
                    scope: { type: 'string', description: 'Space separated' },
                    client_id: { type: 'string' },
                    client_secret: { type: 'string' },
                  },
                },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['grant_type'],
                  properties: {
                    grant_type: { type: 'string', enum: ['client_credentials'] },
                    scope: { type: 'string' },
                    client_id: { type: 'string' },
                    client_secret: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: json('Access token', {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                token_type: { type: 'string' },
                expires_in: { type: 'integer' },
                scope: { type: 'string' },
              },
            }),
            ...errors(400, 401, 403, 429),
          },
        }),
      },
      '/oauth/introspect': {
        post: operation({
          tag: 'OAuth2',
          summary: 'Introspect a token',
          description:
            'RFC 7662. Reports `active: false` for a token whose session was revoked, which plain signature checks cannot detect.',
          security: [{ basicAuth: [] }, {}],
          body: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: {
                    token: { type: 'string' },
                    client_id: { type: 'string' },
                    client_secret: { type: 'string' },
                  },
                },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: {
                    token: { type: 'string' },
                    client_id: { type: 'string' },
                    client_secret: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: json('Introspection result', {
              type: 'object',
              properties: {
                active: { type: 'boolean' },
                sub: { type: 'string' },
                scope: { type: 'string' },
                exp: { type: 'integer' },
              },
            }),
            ...errors(400, 401, 429),
          },
        }),
      },

      '/admin/users': {
        get: operation({
          tag: 'Administration',
          summary: 'List users',
          description: 'Requires `users:read`.',
          params: [
            { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: json('Users', {
              type: 'object',
              properties: { users: { type: 'array', items: ref('User') }, nextCursor: { type: ['string', 'null'] } },
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
      '/admin/users/{id}': {
        get: operation({
          tag: 'Administration',
          summary: 'Get a user with roles and active sessions',
          params: [pathParam('id', 'User id')],
          responses: { 200: json('User', ref('User')), ...errors(400, 401, 403, 404) },
        }),
        patch: operation({
          tag: 'Administration',
          summary: 'Enable or disable a user',
          description:
            'Requires `users:write`. Disabling revokes every session. An admin cannot disable their own account.',
          params: [pathParam('id', 'User id')],
          body: jsonBody(bodies.setStatus),
          responses: { 204: { description: 'Updated' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/users/{id}/unlock': {
        post: operation({
          tag: 'Administration',
          summary: 'Clear a lockout',
          params: [pathParam('id', 'User id')],
          responses: { 204: { description: 'Unlocked' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/users/{id}/revoke-sessions': {
        post: operation({
          tag: 'Administration',
          summary: 'Revoke every session for a user',
          params: [pathParam('id', 'User id')],
          responses: { 204: { description: 'Revoked' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/users/{id}/roles': {
        post: operation({
          tag: 'Administration',
          summary: 'Grant a role',
          description: 'Requires `roles:manage`. Sessions are revoked so the new role is reflected immediately.',
          params: [pathParam('id', 'User id')],
          body: jsonBody(bodies.grantRole),
          responses: { 204: { description: 'Granted' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/users/{id}/roles/{role}': {
        delete: operation({
          tag: 'Administration',
          summary: 'Revoke a role',
          description: 'An admin cannot remove their own admin role.',
          params: [pathParam('id', 'User id'), pathParam('role', 'Role name', { type: 'string' })],
          responses: { 204: { description: 'Revoked' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/roles': {
        get: operation({
          tag: 'Administration',
          summary: 'List roles and their permissions',
          responses: { 200: json('Roles', { type: 'object' }), ...errors(401, 403) },
        }),
      },
      '/admin/clients': {
        get: operation({
          tag: 'Administration',
          summary: 'List OAuth2 clients',
          description: 'Requires `clients:manage`.',
          responses: {
            200: json('Clients', { type: 'object', properties: { clients: { type: 'array', items: ref('Client') } } }),
            ...errors(401, 403),
          },
        }),
        post: operation({
          tag: 'Administration',
          summary: 'Create an OAuth2 client',
          description: 'The secret is returned once and stored only as a keyed hash.',
          body: jsonBody(bodies.createClient),
          responses: {
            201: json('Created', {
              allOf: [ref('Client'), { type: 'object', properties: { clientSecret: { type: 'string' } } }],
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
      '/admin/clients/{id}': {
        delete: operation({
          tag: 'Administration',
          summary: 'Revoke a client',
          params: [pathParam('id', 'Client id')],
          responses: { 204: { description: 'Revoked' }, ...errors(400, 401, 403, 404) },
        }),
      },
      '/admin/keys': {
        get: operation({
          tag: 'Administration',
          summary: 'List signing keys',
          description: 'Requires `keys:rotate`.',
          responses: { 200: json('Keys', { type: 'object' }), ...errors(401, 403) },
        }),
      },
      '/admin/keys/rotate': {
        post: operation({
          tag: 'Administration',
          summary: 'Rotate the signing key',
          description: 'The previous key is retired but stays in the JWKS until outstanding tokens expire.',
          responses: {
            201: json('New active key', { type: 'object', properties: { kid: { type: 'string' } } }),
            ...errors(401, 403),
          },
        }),
      },
      '/admin/audit': {
        get: operation({
          tag: 'Administration',
          summary: 'Read the audit log',
          description: 'Requires `audit:read`.',
          params: [
            { name: 'actorId', in: 'query', schema: { type: 'string' } },
            { name: 'targetId', in: 'query', schema: { type: 'string' } },
            { name: 'action', in: 'query', schema: { type: 'string', examples: ['auth.login'] } },
            { name: 'before', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500, default: 100 } },
          ],
          responses: {
            200: json('Audit events', {
              type: 'object',
              properties: {
                events: { type: 'array', items: { type: 'object' } },
                nextBefore: { type: ['integer', 'null'] },
              },
            }),
            ...errors(400, 401, 403),
          },
        }),
      },
    },
  };
}
