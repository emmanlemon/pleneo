import { config } from '#config';

const TIMEOUT_MS = 10_000;
let cached = { token: null, expiresAt: 0 };

export class EventsClientError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'EventsClientError';
    this.status = status;
  }
}

async function requestToken() {
  const basic = Buffer.from(`${config.EVENTS_CLIENT_ID}:${config.EVENTS_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${config.AUTH_INTERNAL_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${basic}` },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new EventsClientError(`token endpoint responded ${res.status}`, res.status);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 30) * 1000 };
  return cached.token;
}

export const invalidateServiceToken = () => {
  cached = { token: null, expiresAt: 0 };
};

export const serviceToken = () =>
  cached.token && cached.expiresAt > Date.now() ? Promise.resolve(cached.token) : requestToken();

async function post(path, body, retryOnUnauthorized = true) {
  const token = await serviceToken();
  const res = await fetch(`${config.EVENTS_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 && retryOnUnauthorized) {
    invalidateServiceToken();
    return post(path, body, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new EventsClientError(data.detail ?? `events service responded ${res.status}`, res.status);
  return data;
}

export const publishEvent = ({ type, payload, idempotencyKey, occurredAt, correlationId }) =>
  post('/events', { type, payload, idempotencyKey, occurredAt, correlationId });

export const enqueueJob = ({ type, queue = 'default', payload, runAt, idempotencyKey, priority }) =>
  post('/jobs', { type, queue, payload, runAt, idempotencyKey, priority });
