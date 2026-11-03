# authzero

Standalone authentication and authorization microservice. Node.js 20+, Express, PostgreSQL.

## Security model

- Passwords hashed with Argon2id (64 MiB, t=3, p=4); transparent rehash on login when parameters change
- Access tokens are RS256 JWTs (15 min) signed with DB-stored keys encrypted at rest (AES-256-GCM); public keys served at `/.well-known/jwks.json`; automatic rotation every 90 days with a verification grace window
- Refresh tokens are opaque, stored hashed, rotated on every use; reuse of a rotated token revokes the whole session family
- Access tokens are bound to a server-side session, so logout, password change, role change and admin revocation take effect immediately on this service
- Account lockout after repeated failures, per-route rate limiting, uniform responses on register / forgot-password / resend to prevent user enumeration, constant-time comparisons and dummy hashing on unknown users
- TOTP MFA with encrypted secrets and single-use recovery codes; MFA login is a two-step challenge with a short-lived challenge token
- Email verification and password reset via hashed single-use tokens; password history enforcement
- OAuth2 `client_credentials` grant for service-to-service calls, with scoped tokens and RFC 7662 introspection
- Role / permission based authorization; full audit log; signed outbox webhook for downstream email/notification services
- Helmet, strict CORS allowlist, HPP, JSON-only mutating requests, body size limits, `httpOnly` + `SameSite=Strict` refresh cookie, redacted structured logs

## Architecture

```
src/
  server.js, app.js          bootstrap and Express composition
  config/                    validated environment (zod), fails fast
  api/                       top-level router + system endpoints (health, readiness, JWKS, discovery)
  common/                    cross-cutting, framework-level code
    errors/                  typed exception hierarchy, domain error factories, RFC 7807 handler
    validation/              shared rules + FluentValidation-style validator middleware
    http/                    async handler, request context, response helpers
    middleware/              authenticate, authorize (permission / role / scope / MFA step-up), rate limits, hardening
  infrastructure/            technical adapters
    database/                pg pool, migration runner, SQL migrations
    security/                argon2 + AES-GCM crypto, RS256 JWT, signing-key lifecycle
    logging/                 pino with secret redaction
    messaging/               transactional outbox + signed webhook delivery
    jobs/                    outbox dispatcher and hourly maintenance
  modules/<feature>/         vertical slices (auth, mfa, users, clients, admin, audit)
    <feature>.routes.js      wiring only
    <feature>.controller.js  HTTP <-> service translation
    <feature>.validators.js  request contracts
    services/                use cases and transactions
    repositories/            SQL
    domain/                  pure business rules
tests/
  unit/api                   endpoint tests through the real Express app with services mocked (supertest)
  unit/middleware, common    guards, validator, error handler
  unit/services              login, session rotation, password policy
  e2e/                       full flow against a running instance (E2E_BASE_URL)
```

Internal imports use package subpath aliases (`#config`, `#common/*`, `#infra/*`, `#modules/*`) declared in `package.json`, so files can move without rewriting paths. Routes only wire middleware; controllers translate HTTP to service calls; services own business rules and transactions; repositories own SQL. No file exceeds ~100 lines.

## Testing

```bash
npm test                 # unit + endpoint tests, no database required
npm run test:coverage    # same with v8 coverage
E2E_BASE_URL=http://localhost:4000 npm run test:e2e   # against a running, migrated, seeded instance
```

## Validation

Validators are declared per use case in `*.validators.js` (FluentValidation style) from shared rules in `src/core/validation/rules.js`. Unknown fields are rejected. A failed validation returns `400` with one entry per violation:

```json
{
  "type": "urn:authzero:error:validation-failed",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "One or more validation errors occurred",
  "instance": "/auth/register",
  "requestId": "…",
  "errors": [{ "field": "email", "source": "body", "code": "INVALID_FORMAT", "message": "Invalid email address" }]
}
```

## Error handling

All failures are typed exceptions (`src/core/errors/app-error.js`, domain factories in `domain-errors.js`) rendered by one global handler as `application/problem+json` (RFC 7807) with a stable machine-readable `code` and the request id. Database, JSON parsing, payload size, JWT and unknown errors are normalised there; internals are never leaked and 5xx are logged with the stack. 401 responses carry `WWW-Authenticate: Bearer`. Set `ADMIN_REQUIRE_MFA=true` to require an MFA-authenticated session for all `/admin` routes.

## Run locally

```bash
cp .env.example .env
npm run keys:generate-kek          # paste output into KEY_ENCRYPTION_KEY
docker compose up -d postgres
npm install
npm run migrate
npm run seed:admin -- admin@example.com 'StrongPassword#2024'
npm run dev
```

Or everything in Docker: `docker compose up --build`.

## Endpoints

| Method     | Path                                                                  | Auth                | Purpose                                            |
| ---------- | --------------------------------------------------------------------- | ------------------- | -------------------------------------------------- |
| POST       | /auth/register                                                        | –                   | Create account (always 202)                        |
| POST       | /auth/login                                                           | –                   | Password login; returns tokens or an MFA challenge |
| POST       | /auth/login/mfa                                                       | –                   | Complete MFA challenge                             |
| POST       | /auth/refresh                                                         | cookie or body      | Rotate refresh token                               |
| POST       | /auth/logout, /auth/logout-all                                        | Bearer              | Revoke current / all sessions                      |
| POST       | /auth/email/verify, /auth/email/resend                                | –                   | Email verification                                 |
| POST       | /auth/password/forgot, /auth/password/reset                           | –                   | Password reset flow                                |
| POST       | /auth/password/change                                                 | Bearer              | Change password (re-auth)                          |
| GET/DELETE | /auth/sessions[/:id]                                                  | Bearer              | Manage own sessions                                |
| POST       | /auth/mfa/setup, /enable, /disable, /recovery-codes                   | Bearer              | TOTP MFA                                           |
| GET/PATCH  | /users/me                                                             | Bearer              | Profile                                            |
| POST       | /oauth/token                                                          | client creds        | `client_credentials` grant                         |
| POST       | /oauth/introspect                                                     | client creds        | Token introspection                                |
| *          | /admin/users, /admin/roles, /admin/clients, /admin/keys, /admin/audit | Bearer + permission | Administration                                     |
| GET        | /.well-known/jwks.json, /.well-known/openid-configuration             | –                   | Key discovery                                      |
| GET        | /health, /ready                                                       | –                   | Probes                                             |

## Verifying tokens in other services

Fetch `/.well-known/jwks.json`, verify RS256 signature, `iss` = `JWT_ISSUER`, `aud` = `JWT_AUDIENCE`, header `typ` = `at+jwt`. Claims: `sub`, `token_use` (`user` | `client`), `sid`, `email`, `roles`, `permissions`, `scope`. For immediate revocation semantics call `/oauth/introspect` with client credentials.

## Outbox events

Delivered as signed POSTs to `EVENT_WEBHOOK_URL` (`x-authzero-signature: sha256=HMAC(secret, "<timestamp>.<body>")`). Types: `user.registered` (carries `verificationToken`), `user.email_verification_requested`, `user.password_reset_requested` (carries `resetToken`), `user.password_changed`, `user.email_verified`, `user.locked`, `user.mfa_enabled`, `user.mfa_disabled`, `session.reuse_detected`, `user.registration_attempt_existing`. The consumer is responsible for building the email links.

## API reference

- Reference UI: http://localhost:4000/docs
- Document: http://localhost:4000/openapi.json

The document is generated from the shared zod rules, so constraints such as the password policy and token formats stay in step with the validators. A test asserts it covers exactly the routes the service exposes. Disable both endpoints with `DOCS_ENABLED=false`.
