/**
 * Environment configuration.
 *
 * Loads `backend/.env` first, then the repository-root `.env`. Real process
 * environment variables always win, which is what deployment platforms set.
 * Nothing here is ever exposed to the browser: the frontend only ever learns
 * about `VITE_API_URL`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository-relative paths, resolved once so every module agrees on them. */
export const paths = {
  backendRoot: path.resolve(currentDir, '..', '..'),
  get repoRoot() {
    return path.resolve(this.backendRoot, '..');
  },
  get databaseDir() {
    return path.join(this.repoRoot, 'database');
  },
  get migrationsDir() {
    return path.join(this.databaseDir, 'migrations');
  },
  get seedDir() {
    return path.join(this.databaseDir, 'seed');
  },
};

loadEnvFile({ path: path.join(paths.backendRoot, '.env'), quiet: true });
loadEnvFile({ path: path.join(paths.repoRoot, '.env'), quiet: true });

function readString(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  return String(raw).trim();
}

function readInt(name, fallback) {
  const raw = readString(name, undefined);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(name, fallback) {
  const raw = readString(name, undefined);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function readList(name, fallback) {
  const raw = readString(name, undefined);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = readString('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const databaseUrl = readString('DATABASE_URL', '');

/**
 * Driver selection. An explicit DATABASE_DRIVER always wins; otherwise a
 * DATABASE_URL implies PostgreSQL/Supabase and its absence means the
 * zero-configuration SQLite file database.
 */
const databaseDriver = (() => {
  const explicit = readString('DATABASE_DRIVER', '').toLowerCase();
  if (explicit === 'postgres' || explicit === 'postgresql') return 'postgres';
  if (explicit === 'sqlite') return 'sqlite';
  return databaseUrl ? 'postgres' : 'sqlite';
})();

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: readInt('PORT', 4000),
  trustProxy: readBool('TRUST_PROXY', isProduction),

  database: {
    driver: databaseDriver,
    url: databaseUrl,
    /** Used by the SQLite driver only. */
    sqlitePath: readString(
      'SQLITE_PATH',
      path.join(paths.databaseDir, isTest ? 'cityguide.test.db' : 'cityguide.db'),
    ),
    /** Supabase requires TLS; local Postgres usually does not. */
    ssl: readBool('DATABASE_SSL', /supabase\.(co|com|net)/i.test(databaseUrl) || isProduction),
    poolMax: readInt('DATABASE_POOL_MAX', 10),
  },

  session: {
    cookieName: readString('SESSION_COOKIE_NAME', 'cityguide_session'),
    /** Session lifetime in hours. */
    ttlHours: readInt('SESSION_TTL_HOURS', 24 * 7),
    /** Secure cookies require HTTPS; disabled for http://localhost. */
    cookieSecure: readBool('SESSION_COOKIE_SECURE', isProduction),
    cookieSameSite: readString('SESSION_COOKIE_SAMESITE', 'lax'),
  },

  cors: {
    origins: readList('CORS_ORIGINS', [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ]),
  },

  geocoding: {
    provider: 'nominatim',
    baseUrl: readString('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    /**
     * Nominatim's usage policy requires a descriptive User-Agent that
     * identifies the application and provides a contact address.
     *
     * IMPORTANT: before deploying publicly, set NOMINATIM_USER_AGENT to include
     * a real contact — e.g.
     *   CityGuide/1.0 (+https://your-domain.example) contact@your-domain.example
     * The OSM Foundation rejects User-Agents containing placeholder domains such
     * as `example.com`, so the default below deliberately carries no contact
     * rather than a fictitious one. Set NOMINATIM_EMAIL to pass a contact
     * through the `email` query parameter instead.
     */
    userAgent: readString(
      'NOMINATIM_USER_AGENT',
      'CityGuide/1.0 (self-hosted open-source attraction itinerary planner)',
    ),
    contactEmail: readString('NOMINATIM_EMAIL', ''),
    /** Nominatim asks for at most one request per second. */
    minIntervalMs: readInt('GEOCODE_MIN_INTERVAL_MS', 1100),
    timeoutMs: readInt('GEOCODE_TIMEOUT_MS', 8000),
    cacheTtlDays: readInt('GEOCODE_CACHE_TTL_DAYS', 30),
    maxResultLabelLength: 400,
  },

  rateLimit: {
    /** Applied to /api/auth/* to slow credential stuffing. */
    authWindowMs: readInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
    authMax: readInt('RATE_LIMIT_AUTH_MAX', isTest ? 1000 : 20),
    /** Applied to the whole API. */
    apiWindowMs: readInt('RATE_LIMIT_API_WINDOW_MS', 15 * 60 * 1000),
    apiMax: readInt('RATE_LIMIT_API_MAX', isTest ? 100000 : 1000),
    /** Geocoding is deliberately tighter: it hits a shared public service. */
    geocodeWindowMs: readInt('RATE_LIMIT_GEOCODE_WINDOW_MS', 60 * 1000),
    geocodeMax: readInt('RATE_LIMIT_GEOCODE_MAX', isTest ? 1000 : 20),
  },

  logging: {
    level: readString('LOG_LEVEL', isTest ? 'silent' : isProduction ? 'info' : 'debug'),
  },

  /** Bounded page sizes keep list endpoints predictable. */
  pagination: {
    defaultLimit: readInt('PAGINATION_DEFAULT_LIMIT', 12),
    maxLimit: readInt('PAGINATION_MAX_LIMIT', 100),
  },
};

/** Human-readable summary printed at boot; contains no secrets. */
export function describeConfig() {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    database: {
      driver: config.database.driver,
      target:
        config.database.driver === 'postgres'
          ? redactConnectionString(config.database.url)
          : config.database.sqlitePath,
      ssl: config.database.ssl,
    },
    corsOrigins: config.cors.origins,
    geocoding: {
      provider: config.geocoding.provider,
      baseUrl: config.geocoding.baseUrl,
      minIntervalMs: config.geocoding.minIntervalMs,
    },
  };
}

/** Strips the password from a connection string so it is safe to log. */
export function redactConnectionString(url) {
  if (!url) return '(not set)';
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable connection string)';
  }
}
