import { DomainErrors } from '#common/errors/domain-errors.js';
import { keyedHash, safeEqual } from '#infra/security/crypto.js';
import * as clients from './client.repository.js';

const DUMMY_HASH = 'x'.repeat(64);

export function parseClientCredentials(req) {
  const header = req.get('authorization') ?? '';
  if (header.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx > 0)
      return {
        clientId: decodeURIComponent(decoded.slice(0, idx)),
        clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
      };
  }
  return { clientId: req.body.client_id, clientSecret: req.body.client_secret };
}

export async function authenticateClient({ clientId, clientSecret }) {
  if (!clientId || !clientSecret) throw DomainErrors.clientAuthRequired();
  const client = await clients.findByClientId(clientId);
  const valid = safeEqual(client?.client_secret_hash ?? DUMMY_HASH, keyedHash(clientSecret));
  if (!client || !valid || client.status !== 'active') throw DomainErrors.invalidClient();
  return client;
}
