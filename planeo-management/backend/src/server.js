import http from 'node:http';
import { config } from '#config';
import { closePool, healthCheck } from '#infra/database/pool.js';
import { startScheduler, stopScheduler } from '#infra/jobs/scheduler.js';
import { logger } from '#infra/logging/logger.js';
import { closeSocketServer, createSocketServer } from '#infra/realtime/socket-server.js';
import { createApp } from './app.js';

async function main() {
  await healthCheck();
  const server = http.createServer(createApp());
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  createSocketServer(server);
  server.listen(config.PORT, config.HOST, () =>
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, socketPath: config.SOCKET_ENABLED ? config.SOCKET_PATH : null },
      'planeo management api listening',
    ),
  );
  startScheduler();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopScheduler();
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
    closeSocketServer()
      .catch(() => {})
      .finally(() => {
        server.close(async () => {
          await closePool().catch(() => {});
          clearTimeout(forceExit);
          process.exit(0);
        });
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
