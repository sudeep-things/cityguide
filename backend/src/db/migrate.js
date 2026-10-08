/**
 * Migration runner.
 *
 * Migrations are plain `.sql` files under `database/migrations/<dialect>/`,
 * applied in filename order and recorded in `schema_migrations`. Every file is
 * written to be idempotent (`CREATE TABLE IF NOT EXISTS`), so running this on
 * every boot is safe and a fresh clone or a fresh deployment needs no manual
 * step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { paths } from '../config/env.js';
import { logger as rootLogger } from '../config/logger.js';
import { closeDb, getDb } from './index.js';

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`;

/** Directory holding the migrations for a dialect. */
function migrationsDirectoryFor(dialect) {
  return path.join(paths.migrationsDir, dialect === 'postgres' ? 'postgres' : 'sqlite');
}

/**
 * Applies every pending migration.
 *
 * @param {{db?: object, logger?: import('pino').Logger}} [options]
 * @returns {Promise<{applied: string[], skipped: number, dialect: string}>}
 */
export async function runMigrations({ db, logger = rootLogger } = {}) {
  const database = db ?? (await getDb());

  await database.exec(MIGRATIONS_TABLE);

  const directory = migrationsDirectoryFor(database.dialect);

  if (!fs.existsSync(directory)) {
    logger.warn({ directory }, 'No migrations directory found for this dialect');
    return { applied: [], skipped: 0, dialect: database.dialect };
  }

  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const applied = [];
  let skipped = 0;

  for (const file of files) {
    const already = await database.one('SELECT id FROM schema_migrations WHERE id = ?', [file]);
    if (already) {
      skipped += 1;
      continue;
    }

    const sql = fs.readFileSync(path.join(directory, file), 'utf8');
    logger.info({ migration: file, dialect: database.dialect }, 'Applying migration');

    // A migration file may contain several statements.
    await database.exec(sql);

    await database.execute('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
      file,
      new Date().toISOString(),
    ]);

    applied.push(file);
  }

  if (applied.length === 0) {
    logger.info({ skipped, dialect: database.dialect }, 'Database schema is up to date');
  } else {
    logger.info({ applied, dialect: database.dialect }, 'Migrations applied');
  }

  return { applied, skipped, dialect: database.dialect };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runMigrations()
    .then(async (result) => {
      rootLogger.info(result, 'Migration command finished');
      await closeDb();
      process.exit(0);
    })
    .catch(async (error) => {
      rootLogger.fatal({ err: error }, 'Migration command failed');
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
