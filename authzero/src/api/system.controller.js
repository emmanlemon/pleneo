import { config } from '#config';
import { ok } from '#common/http/respond.js';
import { healthCheck } from '#infra/database/pool.js';
import { getJwks } from '#infra/security/signing-keys.js';

const issuer = config.JWT_ISSUER.replace(/\/$/, '');

export const health = (_req, res) => ok(res, { status: 'ok' });

export const ready = async (_req, res) => {
  await healthCheck().then(
    () => ok(res, { status: 'ready' }),
    () => res.status(503).json({ status: 'unavailable' }),
  );
};

export const jwks = async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  ok(res, await getJwks());
};

export const openidConfiguration = (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  ok(res, {
    issuer: config.JWT_ISSUER,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    token_endpoint: `${issuer}/v1/oauth/token`,
    introspection_endpoint: `${issuer}/v1/oauth/introspect`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    id_token_signing_alg_values_supported: ['RS256'],
  });
};
