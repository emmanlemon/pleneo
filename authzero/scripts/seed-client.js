import { closePool } from '#infra/database/pool.js';
import { keyedHash } from '#infra/security/crypto.js';
import { logger } from '#infra/logging/logger.js';
import * as clients from '#modules/clients/client.repository.js';

async function main() {
  const [name, clientId, clientSecret, scopeList] = process.argv.slice(2);
  if (!name || !clientId || !clientSecret) {
    throw new Error('usage: seed-client <name> <client_id> <client_secret> [scopes,comma,separated]');
  }
  if (clientSecret.length < 24) throw new Error('client secret must be at least 24 characters');

  const scopes = (scopeList ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const client = await clients.upsertByClientId({
    clientId,
    secretHash: keyedHash(clientSecret),
    name,
    scopes,
    createdBy: null,
  });
  logger.info({ id: client.id, clientId: client.client_id, scopes: client.scopes }, 'client ready');
}

main()
  .catch((err) => {
    logger.error({ err: err.message }, 'client seed failed');
    process.exitCode = 1;
  })
  .finally(closePool);
