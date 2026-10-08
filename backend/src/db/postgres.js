/**
 * PostgreSQL / Supabase driver.
 *
 * Activated automatically when DATABASE_URL is present. Queries are written
 * once with `?` placeholders and compiled to `$1..$n` here, so services never
 * need to know which dialect is underneath.
 */
import pg from 'pg';
import { toIso } from '../utils/serialize.js';

const { Pool, types } = pg;

/**
 * Default type parsers return PostgreSQL `int8` as a string, which would leak
 * into pagination totals. Application ids and counts are comfortably within
 * JavaScript's safe integer range, so parse them as numbers.
 */
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number(value)));
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));

/** Compiles `?` placeholders into PostgreSQL's positional `$n` form. */
function toPositional(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/** Dates become ISO strings so both drivers emit identical row shapes. */
function normalizeRow(row) {
  if (row === undefined || row === null) return null;
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    output[key] = value instanceof Date ? toIso(value) : value;
  }
  return output;
}

export function createPostgresDatabase({ connectionString, ssl, poolMax, logger }) {
  const pool = new Pool({
    connectionString,
    max: poolMax,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: 'cityguide-api',
  });

  pool.on('error', (error) => {
    logger?.error({ err: error }, 'Idle PostgreSQL client error');
  });

  const compileCache = new Map();
  function compile(sql) {
    let compiled = compileCache.get(sql);
    if (!compiled) {
      compiled = toPositional(sql);
      compileCache.set(sql, compiled);
    }
    return compiled;
  }

  function makeApi(runner) {
    const api = {
      dialect: 'postgres',
      driverLabel: 'postgres',

      async all(sql, params = []) {
        const { rows } = await runner(compile(sql), params);
        return rows.map(normalizeRow);
      },

      async one(sql, params = []) {
        const { rows } = await runner(compile(sql), params);
        return rows.length ? normalizeRow(rows[0]) : null;
      },

      async execute(sql, params = []) {
        const result = await runner(compile(sql), params);
        return {
          changes: Number(result.rowCount ?? 0),
          lastInsertId: result.rows?.[0]?.id ? Number(result.rows[0].id) : 0,
        };
      },

      async exec(sql) {
        await runner(sql, []);
      },

      /** Case-insensitive comparison fragment; ESCAPE keeps % and _ literal. */
      ilike(column) {
        return `${column} ILIKE ? ESCAPE '\\'`;
      },

      boolean(value) {
        return Boolean(value);
      },

      async tx(fn) {
        // A transaction already owns a client, so nest via savepoints.
        if (runner.isTransactionClient) {
          return api.tx.savepoint(fn);
        }
        const client = await pool.connect();
        const clientRunner = Object.assign(
          (text, values) => client.query(text, values),
          { isTransactionClient: true },
        );
        const txApi = makeApi(clientRunner);
        let depth = 0;

        txApi.tx.savepoint = async (nestedFn) => {
          const name = `cityguide_sp_${depth}`;
          depth += 1;
          await client.query(`SAVEPOINT ${name}`);
          try {
            const result = await nestedFn(txApi);
            await client.query(`RELEASE SAVEPOINT ${name}`);
            return result;
          } catch (error) {
            await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
            throw error;
          } finally {
            depth -= 1;
          }
        };

        try {
          await client.query('BEGIN');
          const result = await fn(txApi);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            logger?.error(
              { err: rollbackError, originalError: error?.message },
              'Failed to roll back PostgreSQL transaction',
            );
          }
          throw error;
        } finally {
          client.release();
        }
      },

      async close() {
        compileCache.clear();
        await pool.end();
      },
    };

    return api;
  }

  const base = makeApi((text, values) => pool.query(text, values));

  return {
    ...base,
    /** Exposed for health checks. */
    async ping() {
      await pool.query('SELECT 1');
      return true;
    },
  };
}
