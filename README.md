# Pleneo platform

Four services: one identity provider, one event bus, one management plane, one IoT cloud.

```
authzero/            Identity: users, sessions, MFA, OAuth2 client credentials, JWKS, signed outbox webhook (port 4000)
pleneo-events/       Event bus: events, Postgres job queues with backoff and dead letter, cron scheduler,
                     signed webhook subscriptions, email dispatch (log / Mailtrap / Gmail) (port 4200)
pleneo-management/   Management API (port 4100) with transactional outbox, notifications, inbound webhook,
                     and the Next.js console (port 3000) with notification bell, queue admin and device UI
pleneo-iot/          IoT cloud: MQTT broker and HTTP device plane, device registry, credentials, telemetry ingestion,
                     threshold rules, alerts, commands and device shadow state (port 4300)
scripts/             connect-local.mjs wires all four services for local development
```

## Flow

```
user action ──▶ management API ──(same transaction)──▶ outbox_events
                                   outbox relay ──(client credentials)──▶ pleneo-events POST /v1/events
pleneo-events ── fan-out in the event transaction ──▶ webhook.deliver jobs ──▶ management POST /v1/webhooks/events (HMAC)
                                                  └──▶ internal handlers ──▶ email.send jobs ──▶ Mailtrap / Gmail / log
authzero outbox ──(HMAC webhook)──▶ pleneo-events POST /v1/ingest/authzero ──▶ auth.* events ──▶ verification / reset emails
management webhook handler ──▶ notifications table ──▶ Socket.IO push ──▶ console bell ──▶ optional email.send job

device ──(device token over MQTT or HTTP)──▶ pleneo-iot ingest ──▶ rules engine ──▶ alert + outbox
                                              └──▶ pleneo-events ──▶ webhook ──▶ notification + alert email
pleneo-iot sweeper ──▶ iot.device.offline ──▶ same path
```

Every hop is idempotent: outbox rows carry an idempotency key, events deduplicate on it, deliveries deduplicate per event and subscription, the inbound webhook records processed event ids, and scheduled jobs deduplicate per cron slot. Failures retry with exponential backoff and land in the dead-letter view where an admin can retry or cancel.

## API documentation

Every service publishes an OpenAPI 3.1 document and a Scalar reference UI. Request bodies are generated from the same zod validators the API enforces, so the spec cannot drift from the behaviour, and a test in each service asserts the document covers exactly the routes Express actually exposes.

| Service           | Reference                  | Document      | Operations |
| ----------------- | -------------------------- | ------------- | ---------- |
| authzero          | http://localhost:4000/docs | /openapi.json | 40         |
| pleneo-management | http://localhost:4100/docs | /openapi.json | 27         |
| pleneo-events     | http://localhost:4200/docs | /openapi.json | 23         |
| pleneo-iot        | http://localhost:4300/docs | /openapi.json | 37         |

Set `DOCS_ENABLED=false` to remove both endpoints. The reference page loads Scalar from a CDN, so it needs outbound internet; `/openapi.json` is served locally and always works.

## Realtime

The console does not poll for notifications. The management API runs a Socket.IO server on its own port, and the inbound webhook pushes to the browser as soon as an event is handled:

```
pleneo-events ──▶ POST /v1/webhooks/events ──▶ notification row ──▶ Socket.IO ──▶ console updates
```

The browser authenticates its handshake with the same session cookie it uses for REST. Every connection joins a room keyed by user id, and an admin also joins an operator room, so an owner sees their own events and an operator sees the fleet. A rejected handshake makes the console revalidate its session. The header shows a Live indicator while the socket is connected.

**The console does not poll at all.** No query sets a refresh interval. A push names what changed, so the client refreshes that device or project rather than every cached query. The safety nets are window focus, network reconnect, and a full resync when the socket reconnects, since anything raised while it was down was never delivered.

Queue state is the one thing with no domain event behind it, so planeo-events signals it directly. A job transition marks the queue dirty and a debounced sender posts one signed `queue.changed` webhook at most every `QUEUE_SIGNAL_INTERVAL_MS`. It is delivered outside the job queue on purpose: a delivery job would itself be a queue change, and the two would feed each other.

Events: `ready`, `notification:new`, `notification:read`, `event:received`, `queue:changed`.

## Backend for frontend

The console never holds a token and never learns where the identity provider lives. `pleneo-management` is the only origin its browser code knows, and it serves one flat surface under `/v1`. Nothing in a path names an upstream service, so whether a resource is served here or proxied is invisible to the caller.

```
browser ──(session cookie)──▶ pleneo-management /v1/* ──(assertion, server side)──▶ authzero
                                                       ├──▶ pleneo-events
                                                       └──▶ pleneo-iot
```

Signing in posts credentials to the gateway, which calls authzero itself, encrypts the access and refresh tokens with AES-256-GCM and stores them in `bff_sessions`. The browser receives two cookies: an opaque `pleneo_session` that is httpOnly, and a readable `pleneo_csrf` whose hash the gateway holds. The login response carries the profile and the CSRF token, never a token.

The provider token stops at the gateway. For each proxied call the gateway mints a 60 second HS256 assertion bound to one upstream and sends that instead, so no authzero token ever leaves the gateway process.

Each request looks the session up by the SHA-256 of the cookie. When the access token is within sixty seconds of expiry the gateway takes a row lock, refreshes upstream and rewrites the stored pair, so concurrent requests refresh once. A refresh that fails revokes the session. Every mutating request must echo the CSRF cookie in `X-CSRF-Token`, compared against the stored hash. Logout revokes the row, tells authzero, and clears both cookies.

Upstream problem responses pass through unchanged, so error codes stay meaningful, but the provider's address never appears in a body or header. The three upstream services no longer list the console as a CORS origin, so a leaked URL cannot be called from the app's browser context either. The shipped bundle contains exactly one service address:

```bash
docker compose exec frontend sh -c "grep -rhoE 'http://localhost:4[0-9]{3}' /app/frontend/.next/static | sort -u"
# http://localhost:4100
```

Set `BFF_ENABLED=false` to fall back to bearer tokens. `BFF_SESSION_KEY` is 32 bytes of hex and must be set whenever the gateway is on; `BFF_COOKIE_SECURE` must be true in production.

## Gateway

The proxy is a policy enforcement point, not a pass-through.

**Allowlist.** Each upstream has an explicit route table of method and path pattern. A request that does not match one is answered 404 and never reaches the upstream, so the console cannot use its session to publish events, enqueue jobs or post device telemetry. Literal segments win over parameters, and a deeper path never slips through a shorter pattern.

**Resilience.** Reads retry up to twice on a connection error or a 502, 503 or 504, with exponential backoff and jitter; writes never retry. Each upstream has its own circuit breaker that opens after a run of failures, short-circuits with `Retry-After` while open, then lets one probe through. One failing upstream cannot trip the other. Timeouts are per route, and responses stream rather than buffer, capped by `GATEWAY_MAX_RESPONSE_BYTES`.

**Header hygiene.** Hop-by-hop headers, cookies and any client-supplied `Authorization` or `X-Pleneo-Identity` are dropped on the way in. Forwarding headers and the request id are set by the gateway. On the way out only a short list passes, and an upstream `Set-Cookie` is discarded so no upstream can plant a cookie on the console origin.

**Visibility.** `GET /v1/admin/gateway` returns per-upstream request counts, status classes, retries, latency and breaker state. Admin role required.

## Lightweight identity in the services

`pleneo-events` and `pleneo-iot` no longer call the identity provider on the request path. The gateway has already verified the authzero token, so it mints a compact assertion and the upstream verifies it locally:

```
gateway ──▶ HS256 assertion (iss pleneo-gateway, aud pleneo-iot, 60s) ──▶ pleneo-iot verifies with the shared key
```

That replaces a JWKS lookup plus an RS256 verify per request with one symmetric verify and no network call. The assertion is bound to a single audience, so one minted for the events service is rejected by the IoT service. A service client calling an upstream directly still presents an authzero bearer token, and each service keeps its JWKS verifier for that path.

`INTERNAL_IDENTITY_KEY` is 32 bytes of hex shared by the three services. Leave it unset on an upstream and that upstream ignores assertions entirely and requires bearer tokens. The gateway requires it in production.

## Email

`pleneo-events` owns delivery. `EMAIL_PROVIDER` selects one of three:

| Provider   | Use                                                                  |
| ---------- | -------------------------------------------------------------------- |
| `log`      | Default. Writes the message to the log and sends nothing.            |
| `mailtrap` | Needs `MAILTRAP_API_KEY`. Set `MAILTRAP_INBOX_ID` to capture mail in a sandbox inbox instead of delivering it. |
| `gmail`    | Needs `GMAIL_USER` plus an app password or OAuth credentials.        |

Every message, whatever the provider, goes through the `email.send` queue, so a failed send retries with exponential backoff and ends in the dead letter view with the provider's own error.

### Testing delivery from the console

Queues, Email tab, admin only. Enter a recipient and send. The console calls `POST /v1/admin/email/test`, which enqueues an `email.send` job using the `system.test-email` template, then follows the job over the socket and reports the outcome, including the provider's error when it fails. It exercises the real path rather than a side channel, so a green result means notifications work.

```bash
curl -X POST http://localhost:4100/admin/email/test \
  -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"to":"you@example.com","note":"wiring check"}'
```

### Networks that inspect TLS

This one does. It re-signs outbound HTTPS with a Cloudflare Gateway root that Node does not ship, so sends failed with `self-signed certificate in certificate chain` until the root was trusted.

`docker/ca/` is mounted read-only at `/etc/pleneo-ca` in the events service, and `NODE_EXTRA_CA_CERTS` points at the root inside it. That adds a trusted root; it does not disable verification, so a certificate that root did not sign is still rejected. See `docker/ca/README.md` to replace it or drop it on a network that does not inspect TLS. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Sandbox versus live sending

With `MAILTRAP_INBOX_ID` set, mail goes to that sandbox inbox and is captured rather than delivered, and the provider reports itself as `mailtrap-sandbox`. Without it the live sending API is used, which requires a verified sender domain and otherwise answers `Unauthorized`.

## Run it with Docker

The whole platform runs as one stack. `docker-compose.yml` at the repo root builds all five images, creates the four databases, runs every migration, and seeds the admin, the two service clients and the webhook subscription.

```bash
cp .env.example .env      # then fill in the blank secrets, or keep the generated .env
docker compose up -d --build
```

| URL                   | Service                                                            |
| --------------------- | ------------------------------------------------------------------ |
| http://localhost:3000 | Console, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` |
| http://localhost:4100 | management API and the BFF, the only origin the console calls      |
| http://localhost:4000 | authzero, reached by services and by its own docs page             |
| http://localhost:4200 | pleneo-events                                                      |
| http://localhost:4300 | pleneo-iot                                                         |
| mqtt://localhost:1883 | pleneo-iot device plane                                            |

The last three ports stay published so their Scalar pages and the device simulator keep working. The console does not use them.

Two URL families matter and they are not interchangeable. `AUTH_ISSUER` is the browser-facing `http://localhost:4000` because it is the `iss` claim baked into every token, while `AUTH_JWKS_URL` and `AUTH_INTERNAL_URL` point at `http://authzero:4000` so services reach each other over the container network. The same split applies to the webhook subscription, which targets `http://backend:4100/webhooks/events`.

Service credentials are not generated at runtime in this mode. `.env` carries a fixed id and secret per client and `authzero-seed` upserts them, so containers can start in any order and restart without re-provisioning.

Useful commands:

```bash
docker compose ps                      # health of every service
docker compose logs -f iot             # follow one service
docker compose down                    # stop, keep the data volume
docker compose down -v                 # stop and discard the databases
```

The per-service `docker-compose.yml` files remain for working on one service alone. They publish their own Postgres, and `authzero/docker-compose.yml` uses port 5432 like the root stack, so stop one before starting the other.

## Local setup without Docker

1. Start Postgres (any of the compose files) and create databases `authzero`, `pleneo`, `pleneo_events`, `pleneo_iot`.
2. `authzero`: `npm install && npm run migrate && npm run seed:admin -- admin@example.com 'Adm1n-Str0ng-Passw0rd!' && npm run dev`
3. `pleneo-events`, `pleneo-iot` and `pleneo-management`: `npm install` in each (management is a workspace root).
4. Wire everything: `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='...' node scripts/connect-local.mjs` creates both authzero clients, generates shared secrets, writes the `.env` files, migrates pleneo-events and pleneo-iot, and seeds the management subscription for `project.*` and `iot.*`.
5. Restart authzero, then `npm run dev` in `pleneo-events` and `pleneo-iot`, and `npm run dev:backend` plus `npm run dev:frontend` in `pleneo-management`.

Sign in at http://localhost:3000 as the admin to see Devices, and Queues, in the navigation.

Register a device under Devices, copy its claim code, then drive it:

```bash
cd pleneo-iot
DEVICE_EXTERNAL_ID=sensor-001 DEVICE_CLAIM_CODE=XXXX-XXXX-XXXX ITERATIONS=6 SPIKE_AT=4 npm run simulate
```

Or drive the same device over MQTT, which also subscribes for pushed commands and desired state:

```bash
DEVICE_EXTERNAL_ID=sensor-001 DEVICE_CLAIM_CODE=XXXX-XXXX-XXXX ITERATIONS=6 SPIKE_AT=4 npm run simulate:mqtt
```

Against the Docker stack both work the same way, since 4300 and 1883 are published:

```bash
docker compose exec iot node scripts/simulate-device.js   # with DEVICE_* vars set, or run it from the host
```

The spike crosses the seeded temperature rule, which raises an alert, publishes `iot.alert.raised`, and lands as a notification in the console bell. Issue a command from the device page while the MQTT simulator is running and it arrives within milliseconds rather than on the next poll.
