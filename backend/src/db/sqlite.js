/**
 * SQLite driver — built on Node's bundled `node:sqlite` module, so the project
 * runs with no database server and no native compilation.
 *
 * Concurrency note: SQLite has a single writer. Statements are executed
 * synchronously, and transactions are additionally serialised through a
 * promise-chain mutex so two requests can never interleave inside one
 * transaction. Transaction callbacks must therefore stay free of I/O awaits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Serialises whole transactions. Non-transactional statements remain atomic on
 * their own, which SQLite guarantees per statement.
 */
function createMutex() {
  let tail = Promise.resolve();
  return function runExclusive(task) {
    const result = tail.then(task, task);
    // Keep the chain alive even when a transaction rejects.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export function createSqliteDatabase({ file, logger }) {
  const resolved = file === ':memory:' ? file : path.resolve(file);

  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }

  const raw = new DatabaseSync(resolved);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');

  const runExclusive = createMutex();
  const statementCache = new Map();
  let transactionDepth = 0;

  function prepare(sql) {
    let statement = statementCache.get(sql);
    if (!statement) {
      statement = raw.prepare(sql);
      statementCache.set(sql, statement);
    }
    return statement;
  }

  /** node:sqlite yields null-prototype rows; hand back plain objects. */
  function toPlainRow(row) {
    return row === undefined || row === null ? null : { ...row };
  }

  const api = {
    dialect: 'sqlite',
    driverLabel: `sqlite (${resolved})`,

    async all(sql, params = []) {
      return prepare(sql).all(...params).map(toPlainRow);
    },

    async one(sql, params = []) {
      return toPlainRow(prepare(sql).get(...params));
    },

    async execute(sql, params = []) {
      const result = prepare(sql).run(...params);
      return {
        changes: Number(result.changes ?? 0),
        lastInsertId: Number(result.lastInsertRowid ?? 0),
      };
    },

    /** Runs a multi-statement script (migrations). */
    async exec(sql) {
      raw.exec(sql);
    },

    /**
     * Case-insensitive comparison fragment. SQLite's LIKE is already
     * case-insensitive for ASCII; ESCAPE keeps literal % and _ searchable.
     */
    ilike(column) {
      return `${column} LIKE ? ESCAPE '\\'`;
    },

    /** Coerces a boolean for storage; both dialects accept 0/1 here. */
    boolean(value) {
      return value ? 1 : 0;
    },

    async tx(fn) {
      const runInTransaction = async () => {
        const isOutermost = transactionDepth === 0;
        const savepoint = `cityguide_sp_${transactionDepth}`;

        if (isOutermost) raw.exec('BEGIN IMMEDIATE');
        else raw.exec(`SAVEPOINT ${savepoint}`);
        transactionDepth += 1;

        try {
          const result = await fn(api);
          transactionDepth -= 1;
          if (isOutermost) raw.exec('COMMIT');
          else raw.exec(`RELEASE ${savepoint}`);
          return result;
        } catch (error) {
          transactionDepth -= 1;
          try {
            if (isOutermost) raw.exec('ROLLBACK');
            else raw.exec(`ROLLBACK TO ${savepoint}`);
          } catch (rollbackError) {
            logger?.error(
              { err: rollbackError, originalError: error?.message },
              'Failed to roll back SQLite transaction',
            );
          }
          throw error;
        }
      };

      // Nested calls reuse the already-open transaction via a savepoint.
      if (transactionDepth > 0) return runInTransaction();
      return runExclusive(runInTransaction);
    },

    async close() {
      statementCache.clear();
      raw.close();
    },
  };

  return api;
}
