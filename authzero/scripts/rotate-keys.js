import { closePool } from '#infra/database/pool.js';
import { rotateSigningKey } from '#infra/security/signing-keys.js';
import { logger } from '#infra/logging/logger.js';

rotateSigningKey()
  .then((kid) => logger.info({ kid }, 'new active signing key'))
  .catch((err) => {
    logger.error({ err }, 'rotation failed');
    process.exitCode = 1;
  })
  .finally(closePool);
