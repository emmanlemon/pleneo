import { closePool, withTransaction } from '#infra/database/pool.js';
import { email as emailRule, password as passwordRule } from '#common/validation/rules.js';
import { hashPassword } from '#infra/security/crypto.js';
import { logger } from '#infra/logging/logger.js';
import { ROLES } from '#modules/users/catalogue.js';
import { syncCatalogue } from '#modules/users/catalogue.sync.js';
import * as roles from '#modules/users/role.repository.js';
import * as users from '#modules/users/user.repository.js';

async function main() {
  const email = emailRule.parse(process.env.ADMIN_EMAIL ?? process.argv[2]);
  const password = passwordRule.parse(process.env.ADMIN_PASSWORD ?? process.argv[3]);

  await withTransaction(async (client) => {
    await syncCatalogue(client);
    let user = await users.findByEmail(email, client);
    if (!user) {
      user = await users.create({ email, passwordHash: await hashPassword(password), name: 'Administrator' }, client);
      await users.markEmailVerified(user.id, client);
    }
    await roles.assign(user.id, ROLES.ADMIN, null, client);
    await roles.assign(user.id, ROLES.USER, null, client);
    logger.info({ userId: user.id, email }, 'admin user ready');
  });
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(closePool);
