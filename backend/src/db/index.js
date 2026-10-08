/**
 * Database facade.
 *
 * Chooses a driver once per process and exposes a single uniform, promise-based
 * interface:
 *
 *   db.all(sql, params)      -> rows[]
 *   db.one(sql, params)      -> row | null
 *   db.execute(sql, params)  -> { changes, lastInsertId }
 *   db.tx(async (t) => ...)  -> result, committed atomically
 *   db.exec(script)          -> run a multi-statement script
 *   db.ilike(column)         -> case-insensitive comparison fragment
 *
 * Queries are always parameterised; no user input is ever interpolated into
 * SQL text.
 */
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createSqliteDatabase } from './sqlite.js';
import { createPostgresDatabase } from './postgres.js';

let instance = null;

export async function getDb() {
  if (instance) return instance;

  if (config.database.driver === 'postgres') {
    if (!config.database.url) {
      throw new Error(
        'DATABASE_DRIVER=postgres requires DATABASE_URL. Set it in backend/.env or unset DATABASE_DRIVER to use SQLite.',
      );
    }
    instance = createPostgresDatabase({
      connectionString: config.database.url,
      ssl: config.database.ssl,
      poolMax: config.database.poolMax,
      logger,
    });
    await instance.ping();
    logger.info({ driver: 'postgres' }, 'Connected to PostgreSQL');
  } else {
    instance = createSqliteDatabase({ file: config.database.sqlitePath, logger });
    logger.info({ driver: 'sqlite', file: config.database.sqlitePath }, 'Opened SQLite database');
  }

  return instance;
}

export async function closeDb() {
  if (!instance) return;
  await instance.close();
  instance = null;
}

export default { getDb, closeDb };
