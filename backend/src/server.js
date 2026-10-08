/**
 * Server entry point.
 *
 * Boots in a deliberate order: connect, migrate, then listen. Migrations run
 * automatically because every migration is idempotent, which keeps a fresh
 * deployment (and a fresh clone) working without a manual step.
 */
import { createApp } from './app.js';
import { config, describeConfig } from './config/env.js';
import { logger } from './config/logger.js';
import { closeDb, getDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';

async function start() {
  logger.info(describeConfig(), 'Starting CityGuide API');

  const db = await getDb();
  await runMigrations({ db, logger });

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, url: `http://localhost:${config.port}`, api: '/api' },
      'CityGuide API is listening',
    );
  });

  // Without this, a slow client can hold a socket open during shutdown.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    server.close(async (error) => {
      if (error) logger.error({ err: error }, 'Error while closing the HTTP server');
      try {
        await closeDb();
      } catch (closeError) {
        logger.error({ err: closeError }, 'Error while closing the database');
      }
      logger.info('Shutdown complete');
      process.exit(error ? 1 : 0);
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception; shutting down');
    shutdown('uncaughtException');
  });

  return server;
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start the CityGuide API');
  process.exit(1);
});
