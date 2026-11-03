# pleneo-management

Management console for Pleneo. Authentication is delegated to the `authzero` service; this repo contains the resource API, the backend for frontend that fronts it, and the web app.

```
backend/    Node 22 + Express resource API and BFF. Verifies authzero RS256 tokens via JWKS, optional introspection for revocation.
frontend/   Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui). zod + react-hook-form + TanStack Query + axios.
```

## Backend for frontend

`/v1/*` is a token handler. The browser posts credentials to the gateway, which calls authzero server side, encrypts both tokens with AES-256-GCM and keeps them in `bff_sessions`. The browser gets an httpOnly `pleneo_session` cookie and a readable `pleneo_csrf` cookie, never a token, and never the provider's address.

- `modules/bff/session.service.js` resolves a session by the SHA-256 of the cookie, refreshes under a row lock when the access token is within `BFF_REFRESH_SKEW_SECONDS` of expiry, and revokes the session if the refresh fails.
- `modules/gateway/*` proxies `/v1/queues`, `/v1/devices`, `/v1/commands`, `/v1/alerts` and `/v1/rules`. See the gateway section below.
- Mutating requests must echo the CSRF cookie in `X-CSRF-Token`; the gateway compares it against the stored hash.
- `BFF_SESSION_KEY` is 32 bytes of hex and is required while `BFF_ENABLED=true`, which also requires `IOT_URL`. `BFF_COOKIE_SECURE` must be true in production.
- Expired sessions are pruned by the maintenance job. Set `BFF_ENABLED=false` to go back to bearer tokens.

## Gateway

`modules/gateway/` is the policy enforcement point in front of pleneo-events and pleneo-iot. Each file does one job.

- `policy.js` is the route allowlist: method plus path pattern per upstream, with a per-route timeout and retry budget. A request that matches nothing is 404 and never leaves the process, so a console session cannot publish events, enqueue jobs or post device telemetry. Literal segments win over parameters. A test asserts the table matches the console's surface exactly, so a stale entry or a missing one fails the build.
- `circuit-breaker.js` is one breaker per upstream: closed, open after `GATEWAY_BREAKER_THRESHOLD` failures, then half-open for a single probe after `GATEWAY_BREAKER_RESET_MS`. While open the gateway answers 503 with `Retry-After` without dialling out.
- `headers.js` drops hop-by-hop headers, cookies and any client-supplied `Authorization` or `X-Pleneo-Identity` on the way in, sets the forwarding headers itself, and on the way out passes a short allowlist while discarding `Set-Cookie`.
- `identity.js` mints the upstream assertion. See below.
- `metrics.js` counts requests, status classes, retries, short circuits, blocked routes and latency per upstream, served by `GET /v1/admin/gateway` to admins.
- `gateway.js` composes them: match, breaker check, mint, attempt with jittered exponential backoff on reads only, then stream the response back under `GATEWAY_MAX_RESPONSE_BYTES`.

Per-principal throughput is capped by `GATEWAY_RATE_LIMIT_PER_MINUTE`. Authorization stays with the upstream, which is authoritative for its own rules, so the gateway does not duplicate role checks and cannot drift from them.

## Lightweight identity upstream

The gateway has already verified the authzero token, so it does not pass it on. For each proxied call it signs a compact HS256 assertion with `INTERNAL_IDENTITY_KEY`, scoped to one audience and valid for `INTERNAL_IDENTITY_TTL_SECONDS`, and sends it as `X-Pleneo-Identity`.

`pleneo-events` and `pleneo-iot` verify it locally in `infrastructure/auth/identity-verifier.js`. No JWKS fetch, no RS256 verify, no call to authzero on the request path. An assertion minted for one service is rejected by the other. A service client calling an upstream directly still presents an authzero bearer token, and each service keeps its JWKS verifier for exactly that case.

## Backend

Same layering as authzero: `api/` → `modules/<feature>/{routes,controller,validators,service,repository}` with `common/` (errors, validation, middleware) and `infrastructure/` (database, auth, logging). Imports use `#config`, `#common/*`, `#infra/*`, `#modules/*`.

- `authenticate` accepts either the BFF session cookie or a bearer token validated against `AUTH_ISSUER` / `AUTH_AUDIENCE` using the cached remote JWKS; principals are `user` (roles, permissions) or `client` (scopes).
- `AUTH_INTROSPECTION_ENABLED=true` adds revocation checks through authzero's `/oauth/introspect` with a short in-memory cache; the backend needs its own authzero client.
- Errors are RFC 7807 `application/problem+json` with stable `code`s; validation failures list `errors[]` per field.
- Reference module: `projects` (owner scoped, admins and `projects:read` / `projects:write` clients see all).

## Frontend

- `src/lib/api/http.ts`: one origin, `NEXT_PUBLIC_BFF_URL`. Both axios instances send credentials and attach `X-CSRF-Token` to mutating requests. The browser stores no token.
- `src/lib/api/problem.ts`: `ApiError` from problem details and `applyFieldErrors` to push server field errors into react-hook-form.
- `src/lib/auth/*`: zod schemas mirroring authzero's rules, typed API against `/v1/auth/*`, TanStack hooks (`useSession`, `useLogin`, `useLogout`, …).
- `src/lib/events/api.ts` and `src/lib/devices/api.ts` call `/v1/queues/*` and `/v1/devices/*`; the console never addresses those services directly.
- `src/components/auth-guard.tsx` protects the `(app)` route group client-side and redirects to `/login?next=`.
- UI is shadcn/ui (`src/components/ui`, `components.json`). Add more with `npx shadcn@latest add <component>`.

## Run locally

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up -d postgres          # or reuse an existing Postgres and create a `pleneo` database
npm install
npm run migrate --workspace backend
npm run dev:backend                    # http://localhost:4100
npm run dev:frontend                   # http://localhost:3000
```

authzero must be running on `http://localhost:4000`. It no longer needs the console in its `CORS_ORIGINS`, because the browser only ever talks to the gateway on `http://localhost:4100`.

## Quality gates

```bash
npm test          # backend + frontend unit/component tests
npm run lint
npm run typecheck
npm run verify    # all of the above, also run by the Husky pre-push hook
```

`pre-commit` runs lint-staged (eslint --fix + prettier on staged files). `pre-push` runs `npm run verify`.

## Events, outbox and notifications

- **Outbox** (`backend/src/infrastructure/messaging`): project writes insert an `outbox_events` row in the same transaction. A relay publishes rows to pleneo-events with a cached client-credentials token (`EVENTS_CLIENT_ID` / `EVENTS_CLIENT_SECRET`, scopes `events:publish jobs:enqueue`) and backs off exponentially on failure.
- **Inbound webhook** `POST /webhooks/events`: verifies `x-pleneo-signature` against `EVENTS_WEBHOOK_SECRET`, deduplicates on event id and turns `project.*` events into in-app notifications (plus `email.send` jobs when `NOTIFY_EMAIL_ENABLED=true`).
- **Notifications API** `/v1/notifications` (list, unread count, mark read, mark all, delete) backs the bell in the console header and the `/v1/notifications` page.
- **Queue console** `/admin/queues` (admin role): overview, jobs with retry/cancel and attempt history, dead letter, schedules (run now, pause), webhook subscriptions and the event stream, all read from pleneo-events `/admin/*` through the BFF proxy.
- **Email test** `/admin/queues`, Email tab (admin role): `POST /v1/admin/email/test` enqueues an `email.send` job on the `email` queue using the `system.test-email` template, then the card follows that job over the socket and reports the outcome with the provider's error when delivery fails. It uses the same pipeline a real notification does, so it proves the whole path rather than just the provider credentials. The tab also shows which provider pleneo-events is running.

## API reference and realtime

- Reference UI: http://localhost:4100/docs
- Document: http://localhost:4100/openapi.json

Socket.IO runs on the same port. The browser authenticates its handshake with the session cookie, service clients may send a bearer token in `auth.token`, and every connection joins a room per user; an admin also joins `role:admin` so operators see fleet-wide changes rather than only their own.

Nothing in the console polls. The inbound webhook pushes `notification:new`, `event:received` and `queue:changed`, and `invalidateForEvent` narrows the refresh to the device or project named in the payload. Window focus, network reconnect and a socket reconnect each trigger a resync, which covers anything missed while disconnected. Configure with `SOCKET_ENABLED` and `SOCKET_PATH`.
