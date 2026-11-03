import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { logger } from '#infra/logging/logger.js';
import { createBreaker } from './circuit-breaker.js';
import { downstreamHeaders, upstreamHeaders } from './headers.js';
import { identityEnabled, mintIdentity } from './identity.js';
import * as metrics from './metrics.js';
import { UPSTREAMS, matchRoute, upstreamPathFor } from './policy.js';

const BODYLESS = new Set(['GET', 'HEAD']);
const RETRYABLE = new Set([502, 503, 504]);

export const breakers = new Map(
  Object.keys(UPSTREAMS).map((name) => [
    name,
    createBreaker({ failureThreshold: config.GATEWAY_BREAKER_THRESHOLD, resetMs: config.GATEWAY_BREAKER_RESET_MS }),
  ]),
);

const jitteredBackoff = (attempt) => Math.round(2 ** attempt * 100 * (0.5 + Math.random()));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cap(limit, onExceeded) {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length;
      if (seen > limit) {
        onExceeded();
        callback(new Error('upstream response exceeded the gateway limit'));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function relay(res, upstream, name) {
  res.status(upstream.status);
  downstreamHeaders(res, upstream);
  if (upstream.status === 204 || !upstream.body) {
    res.end();
    return;
  }
  const exceeded = () => logger.warn({ upstream: name }, 'gateway truncated an oversized upstream response');
  await pipeline(Readable.fromWeb(upstream.body), cap(config.GATEWAY_MAX_RESPONSE_BYTES, exceeded), res);
}

export function createGateway(name, mount = '') {
  const upstream = UPSTREAMS[name];
  const breaker = breakers.get(name);

  return async function gateway(req, res) {
    const [suffix, query] = req.url.split('?');
    const pathname = `${mount}${suffix === '/' ? '' : suffix}`;
    const route = matchRoute(name, req.method, pathname);
    if (!route) {
      metrics.blocked(name);
      logger.warn({ upstream: name, method: req.method, path: pathname }, 'gateway blocked an unlisted route');
      throw DomainErrors.notFound();
    }

    if (!breaker.allow()) {
      metrics.shortCircuited(name);
      res.set('Retry-After', String(breaker.retryAfterSeconds()));
      throw DomainErrors.upstreamUnavailable(name);
    }

    const identity = identityEnabled() ? await mintIdentity(req.auth, upstream.audience, req.id) : null;
    const body = BODYLESS.has(req.method) ? undefined : JSON.stringify(req.body ?? {});
    const headers = upstreamHeaders(req, {
      identity,
      accessToken: identity ? null : req.bff?.accessToken,
      hasBody: body !== undefined,
    });
    const target = `${upstream.baseUrl()}${upstreamPathFor(name, pathname)}${query ? `?${query}` : ''}`;
    const started = Date.now();
    let response = null;
    let attempts = 0;
    let lastError;

    for (let attempt = 0; attempt <= route.retries; attempt += 1) {
      if (attempt > 0) await sleep(jitteredBackoff(attempt));
      attempts = attempt + 1;
      try {
        const candidate = await fetch(target, {
          method: req.method,
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(route.timeoutMs),
        });
        if (RETRYABLE.has(candidate.status) && attempt < route.retries) {
          await candidate.body?.cancel();
          continue;
        }
        response = candidate;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!response) {
      breaker.failure();
      metrics.record(name, { status: 503, durationMs: Date.now() - started, attempts });
      logger.warn({ upstream: name, route: route.path, err: lastError?.message }, 'gateway upstream failed');
      throw DomainErrors.upstreamUnavailable(name);
    }

    if (response.status >= 500) breaker.failure();
    else breaker.success();
    metrics.record(name, { status: response.status, durationMs: Date.now() - started, attempts });
    await relay(res, response, name);
  };
}

export const gatewayStatus = () => metrics.snapshot(breakers);
export const resetGateway = () => {
  metrics.resetMetrics();
  for (const breaker of breakers.values()) breaker.reset();
};
