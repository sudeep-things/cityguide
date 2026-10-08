/**
 * Drops every application table and reapplies migrations.
 *
 * Development utility: `pnpm db:reset`. It refuses to run against a production
 * environment, and prompts for confirmation unless `--yes` is passed.
 */
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { config } from '../config/env.js';
import { logger as rootLogger } from '../config/logger.js';
import { closeDb, getDb } from './index.js';
import { runMigrations } from './migrate.js';

/**
 * Ordered so that child tables are dropped before the parents they reference,
 * which keeps the operation valid even with foreign keys enforced.
 */
const TABLES_IN_DROP_ORDER = [
  'audit_logs',
  'geocode_cache',
  'itinerary_items',
  'itineraries',
  'saved_places',
  'attractions',
  'categories',
  'sessions',
  'users',
  'schema_migrations',
];

export async function resetDatabase({ db, logger = rootLogger, confirm = false } = {}) {
  if (config.isProduction && !confirm) {
    throw new Error(
      'Refusing to reset the database while NODE_ENV=production. Pass confirm:true if you are certain.',
    );
  }

  const database = db ?? (await getDb());
  const cascade = database.dialect === 'postgres' ? ' CASCADE' : '';

  for (const table of TABLES_IN_DROP_ORDER) {
    await database.exec(`DROP TABLE IF EXISTS ${table}${cascade}`);
    logger.debug({ table }, 'Dropped table');
  }

  const result = await runMigrations({ db: database, logger });
  return result;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const skipPrompt = process.argv.includes('--yes') || process.argv.includes('-y');

  (async () => {
    if (!skipPrompt) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        `This deletes all CityGuide data in the "${config.database.driver}" database. Type "reset" to continue: `,
      );
      rl.close();

      if (answer.trim().toLowerCase() !== 'reset') {
        rootLogger.info('Reset cancelled');
        process.exit(0);
      }
    }

    const result = await resetDatabase({ logger: rootLogger, confirm: true });
    rootLogger.info(result, 'Database reset complete');
    await closeDb();
  })().catch(async (error) => {
    rootLogger.fatal({ err: error }, 'Database reset failed');
    await closeDb().catch(() => {});
    process.exit(1);
  });
}
