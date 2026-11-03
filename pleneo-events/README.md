# pleneo-events

Event bus, job queues, scheduler and notification dispatch for Pleneo. Postgres only, no broker required. Secured by authzero tokens.

## Capabilities

- **Events** `POST /events` (client scope `events:publish` or admin). Idempotent by `idempotencyKey`. Fan-out happens in the same transaction as the insert: one `webhook.deliver` job per matching subscription plus internal handlers (auth emails).
- **Queues** Postgres `FOR UPDATE SKIP LOCKED` polling, per-queue concurrency, priorities, delayed jobs (`runAt`), exponential backoff with jitter (`BACKOFF_BASE_MS` × 2^attempt, capped at `BACKOFF_MAX_MS`), `NonRetryableError` short-circuit, dead-letter after `maxAttempts`, attempt history, stale-lock recovery, retention pruning. `POST /jobs` (scope `jobs:enqueue`) enqueues any registered handler type.
- **Webhooks** Subscriptions match exact types, `prefix.*` or `*`. Deliveries are signed: `x-pleneo-signature: sha256=HMAC(secret, "<timestamp>.<body>")` with `x-pleneo-timestamp`, `x-pleneo-event`, `x-pleneo-event-id`, `x-pleneo-delivery`, `x-pleneo-attempt`. 4xx (except 408/425/429) is final, 410 pauses the subscription, everything else retries. Secrets are AES-256-GCM encrypted at rest.
- **Scheduler** Cron schedules (`cron-parser`, timezone aware) enqueue jobs idempotently per slot; `POST /admin/schedules/:id/run` triggers immediately. `queue.maintenance` is seeded every 5 minutes.
- **Email** Provider abstraction: `log` (default), `mailtrap` or `gmail`. Templates in `src/notifications/templates.js` build links from `APP_BASE_URL`.
- **authzero ingest** `POST /v1/ingest/authzero` verifies authzero's outbox signature (`AUTHZERO_WEBHOOK_SECRET`) and republishes as `auth.<type>` events; registration, verification, reset, lockout and MFA events become email jobs automatically.
- **Admin API** `/admin/*` (admin role or scope `events:manage`): stats, jobs (list, detail with attempts, retry, cancel), events (list, detail with deliveries), subscriptions and schedules CRUD. Consumed by the pleneo-management queue UI.

## Run locally

```bash
cp .env.example .env            # set AUTHZERO_WEBHOOK_SECRET and SECRETS_ENCRYPTION_KEY (npm run keys:generate)
npm install
npm run migrate
npm run seed:subscription -- pleneo-management http://localhost:4100/webhooks/events "project.*"   # prints the webhook secret
npm run dev                     # http://localhost:4200
```

Point authzero at this service: `EVENT_WEBHOOK_URL=http://localhost:4200/v1/ingest/authzero` and the same `EVENT_WEBHOOK_SECRET`.

## Mailtrap

Set `EMAIL_PROVIDER=mailtrap` and `MAILTRAP_API_KEY`. Add `MAILTRAP_INBOX_ID` to use a sandbox inbox, which captures the message instead of delivering it and is what you want outside production; the provider then reports itself as `mailtrap-sandbox`. `EMAIL_FROM` is parsed into a name and address, so both `ops@example.com` and `Pleneo <ops@example.com>` work. Without a sandbox inbox the live sending API is used, which requires a verified sender domain and otherwise answers `Unauthorized`.

On a network that inspects TLS, outbound sends fail with `SELF_SIGNED_CERT_IN_CHAIN`. Trust the inspecting root with `NODE_EXTRA_CA_CERTS`; see `docker/ca/README.md` at the repo root.

Admins can send a test message from the pleneo-management console under Queues, Email.

## Gmail

Set `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, and either `GMAIL_APP_PASSWORD` (2-step verification app password) or `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` for OAuth2. `EMAIL_FROM` must be the Gmail account or a configured alias.

## Tests

```bash
npm test
```

## API reference

- Reference UI: http://localhost:4200/docs
- Document: http://localhost:4200/openapi.json

Publish and enqueue bodies are generated from the zod validators. A test asserts the document covers exactly the routes the service exposes. Disable both endpoints with `DOCS_ENABLED=false`.
