# pleneo-iot

Device registry, telemetry ingestion, rules and command dispatch over MQTT and HTTP. Postgres only, with an embedded broker. Operators authenticate with authzero tokens; devices authenticate with their own rotatable credentials on either transport.

## Two authentication planes

| Plane      | Who                | Credential                                               | Surface                                                  |
| ---------- | ------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| Management | users and services | authzero RS256 token (JWKS verified)                     | `/v1/devices`, `/v1/alerts`, `/v1/rules`, `/v1/commands`             |
| Device     | the hardware       | `dev_<id>_<secret>` bearer token, stored as a keyed hash | `/v1/device/*` over HTTP, or MQTT on port 1883 |

A device never holds a user token, and a user token can never impersonate a device. Device tokens embed the device id so a lookup is a single indexed read, and the secret is compared as a keyed HMAC, never stored in the clear.

## MQTT device plane

Field devices connect to the embedded broker on `MQTT_PORT` (1883 by default) with the same device token they would send over HTTP: username is the external id, password is the token. There is no second credential system and no broker user database.

Every topic is scoped to one device and the broker refuses anything else, so a stolen token reaches exactly one device's data:

| Topic                                  | Direction | Purpose                                    |
| -------------------------------------- | --------- | ------------------------------------------ |
| `devices/{externalId}/telemetry`       | publish   | Same payload shapes as the HTTP ingest     |
| `devices/{externalId}/state/reported`  | publish   | Reported shadow state                      |
| `devices/{externalId}/commands/ack`    | publish   | `{ id, status, result, error }`            |
| `devices/{externalId}/status`          | publish   | Presence, the only topic that may retain   |
| `devices/{externalId}/commands`        | subscribe | Commands pushed the moment they are issued |
| `devices/{externalId}/state/desired`   | subscribe | Desired shadow state pushed on change      |

Publishing to another device, subscribing to another device, subscribing with a wildcard, writing a downlink topic, retaining anything but status, or exceeding `MQTT_MAX_PAYLOAD_BYTES` is denied by the broker.

Messages reuse the HTTP services exactly: telemetry runs the same validation, dedupe, rules and alerting in the same transaction, so both transports behave identically. A malformed message is logged and dropped rather than closing the connection.

### Presence

Connecting marks the device online and disconnecting marks it offline immediately, both emitting the usual events. The sweeper stays as the backstop for devices that vanish without a clean disconnect, and for HTTP-only devices. Set a Last Will on `status` to tell other subscribers as well.

### TLS

Set `MQTT_TLS_KEY_PATH` and `MQTT_TLS_CERT_PATH` together to serve MQTT over TLS. Set `MQTT_ENABLED=false` to run HTTP only.

## Lifecycle

1. **Register** `POST /devices` returns a one-time claim code. The device row starts in `provisioning`.
2. **Activate** `POST /v1/device/activate` exchanges `externalId` + claim code for a device token, clears the claim code and marks the device `active`.
3. **Report** `POST /v1/device/telemetry` accepts a batch, a single reading, or a `metrics` map. Readings are validated against the device type, deduplicated on `(device, metric, timestamp)`, and evaluated against the rules engine inside one transaction.
4. **Rotate or revoke** `POST /devices/:id/credentials` issues a new token and revokes the previous one by default.

## Ingestion guarantees

- Idempotent: replaying a batch inserts nothing new and reports it as `duplicates`.
- Bounded: `INGEST_MAX_BATCH` readings per request, rejected before any write.
- Clock-checked: future timestamps beyond `INGEST_MAX_SKEW_MINUTES` and backfill older than `INGEST_MAX_BACKFILL_DAYS` are rejected.
- Schema-checked: metrics must be declared on the device type.
- Rate limited per device, not per IP, so one noisy device cannot starve a fleet behind the same gateway.

## Rules and alerts

Threshold rules target a device type or a single device. The engine caches enabled rules for 30 seconds and the cache is invalidated on every write, so ingest stays a memory lookup. A breach raises an alert unless an unresolved alert for the same rule and device exists inside the rule's cooldown, which stops alert storms. Alerts are acknowledged or resolved from the console.

## Events

Writes go to a transactional outbox and a relay publishes them to pleneo-events with a client-credentials token:

`iot.device.registered`, `iot.device.activated`, `iot.device.online`, `iot.device.offline`, `iot.device.decommissioned`, `iot.alert.raised`, `iot.alert.resolved`

pleneo-events fans these out to subscribers and to email, and pleneo-management turns alerts and offline devices into in-app notifications.

## Background work

A sweeper marks devices offline after `DEVICE_OFFLINE_AFTER_SECONDS` without contact and emits an event, expires overdue commands, and hourly maintenance prunes telemetry past `TELEMETRY_RETENTION_DAYS`.

## Run locally

```bash
cp .env.example .env            # set DEVICE_SECRET_KEY (npm run keys:generate) and the events client
npm install
npm run migrate
npm run dev                     # http://localhost:4300
```

Simulate a device once it is registered:

```bash
DEVICE_EXTERNAL_ID=sensor-001 DEVICE_CLAIM_CODE=ABCD-EFGH-IJKL ITERATIONS=5 SPIKE_AT=3 npm run simulate
```

The same device over MQTT, which also subscribes for commands and desired state:

```bash
DEVICE_EXTERNAL_ID=sensor-001 DEVICE_CLAIM_CODE=ABCD-EFGH-IJKL ITERATIONS=5 SPIKE_AT=3 npm run simulate:mqtt
```

## Tests

```bash
npm test
```

## API reference

- Reference UI: http://localhost:4300/docs
- Document: http://localhost:4300/openapi.json

Both authentication planes are described as separate security schemes, so the reference makes clear which endpoints take an authzero token and which take a device token. Request bodies come from the zod validators, and a test asserts the document covers exactly the routes the service exposes. Disable both endpoints with `DOCS_ENABLED=false`.
