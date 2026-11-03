import { closePool } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { encrypt, randomToken } from '#infra/security/crypto.js';
import * as subscriptions from '#modules/subscriptions/subscription.repository.js';

async function main() {
  const [name, url, types, providedSecret] = process.argv.slice(2);
  if (!name || !url || !types)
    throw new Error('usage: seed-subscription <name> <url> <eventTypes,comma,separated> [secret]');
  const secret = providedSecret ?? randomToken(48);
  const eventTypes = types
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const existing = await subscriptions.findByName(name);
  const subscription = existing
    ? await subscriptions.update(existing.id, { url, eventTypes, secretEnc: encrypt(secret), status: 'active' })
    : await subscriptions.create({
        name,
        description: 'seeded',
        url,
        secretEnc: encrypt(secret),
        eventTypes,
        createdBy: 'seed',
      });

  logger.info(
    { id: subscription.id, name, url, eventTypes },
    existing ? 'subscription updated' : 'subscription created',
  );
  process.stdout.write(`${secret}\n`);
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(closePool);
