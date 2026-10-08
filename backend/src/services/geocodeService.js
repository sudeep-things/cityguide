/**
 * Geocoding via Nominatim / OpenStreetMap.
 *
 * This is the application's single external integration and it is deliberately
 * conservative, because Nominatim is a donated service with a strict usage
 * policy (https://operations.osmfoundation.org/policies/nominatim/):
 *
 *   * Lookups are user-triggered only. Nothing here runs on a timer, and there
 *     is no autocomplete — the client must submit an address explicitly.
 *   * Every outbound request carries a descriptive User-Agent identifying the
 *     application, as the policy requires.
 *   * Requests are serialised through a queue enforcing a minimum gap of
 *     `GEOCODE_MIN_INTERVAL_MS` (1100 ms, i.e. at most ~1 request/second).
 *   * Successful results are cached in `geocode_cache` for 30 days, so a
 *     repeated address never reaches the network.
 *   * Attribution is returned with the data and rendered by the UI.
 *
 * The browser never talks to Nominatim: the request goes to the API, which
 * normalises the upstream response before returning it.
 */
import { config } from '../config/env.js';
import {
  AppError,
  ErrorCodes,
  upstreamError,
  upstreamUnavailable,
  validationError,
} from '../utils/errors.js';
import { cacheKey, roundCoordinate, stringifyJson, toIso } from '../utils/serialize.js';

/** Rendering requirement for any UI that displays these results. */
export const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
  provider: 'Nominatim (OpenStreetMap)',
  providerUrl: 'https://nominatim.org/',
};

/* -------------------------------------------------------------------------- */
/* Outbound request throttle                                                   */
/* -------------------------------------------------------------------------- */

let lastRequestStartedAt = 0;
let requestChain = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serialises outbound geocoding calls and spaces them by at least
 * `minIntervalMs`. Returns the task's result, or its rejection.
 */
function scheduleOutboundRequest(task) {
  const run = requestChain.then(async () => {
    const earliest = lastRequestStartedAt + config.geocoding.minIntervalMs;
    const waitFor = earliest - Date.now();
    if (waitFor > 0) await sleep(waitFor);

    lastRequestStartedAt = Date.now();
    return task();
  });

  // Keep the chain alive regardless of this task's outcome.
  requestChain = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

async function readCache(db, key) {
  const row = await db.one(
    `SELECT query, display_name, latitude, longitude, payload, provider, created_at
       FROM geocode_cache
      WHERE query_key = ? AND created_at >= ?`,
    [key, new Date(Date.now() - config.geocoding.cacheTtlDays * 86_400_000).toISOString()],
  );

  if (!row) return null;

  return {
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    displayName: row.display_name ?? null,
    provider: row.provider,
    cachedAt: toIso(row.created_at),
    fromCache: true,
    attribution: OSM_ATTRIBUTION,
  };
}

/**
 * Stores a successful lookup. Both supported dialects implement the identical
 * `ON CONFLICT ... DO UPDATE` upsert syntax, so no branching is needed here.
 */
async function writeCache(db, { key, query, latitude, longitude, displayName, payload }) {
  await db.execute(
    `INSERT INTO geocode_cache (query_key, query, display_name, latitude, longitude, payload, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (query_key) DO UPDATE SET
       query        = excluded.query,
       display_name = excluded.display_name,
       latitude     = excluded.latitude,
       longitude    = excluded.longitude,
       payload      = excluded.payload,
       created_at   = ?
    `,
    [
      key,
      query,
      displayName,
      latitude,
      longitude,
      stringifyJson(payload),
      config.geocoding.provider,
      new Date().toISOString(),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* Nominatim call                                                              */
/* -------------------------------------------------------------------------- */

function buildSearchUrl(address) {
  const url = new URL('/search', config.geocoding.baseUrl);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  if (config.geocoding.contactEmail) url.searchParams.set('email', config.geocoding.contactEmail);
  return url.toString();
}

async function callNominatim(address, { logger }) {
  const url = buildSearchUrl(address);

  return scheduleOutboundRequest(async () => {
    let response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          // Required by the Nominatim usage policy.
          'User-Agent': config.geocoding.userAgent,
          Accept: 'application/json',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(config.geocoding.timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      logger?.warn({ err: error, timedOut }, 'Nominatim request failed');

      if (timedOut) {
        throw new AppError(
          504,
          ErrorCodes.UPSTREAM_TIMEOUT,
          'The location service took too long to respond. Please try again.',
          { cause: error },
        );
      }

      throw upstreamUnavailable(
        'The location service is unavailable right now. Please try again shortly.',
        error,
      );
    }

    // A 403 from Nominatim almost always means the User-Agent was refused —
    // a configuration problem, not an outage — so it is logged as an error with
    // the fix spelled out rather than reported as a transient failure.
    if (response.status === 403) {
      logger?.error(
        { status: 403, userAgent: config.geocoding.userAgent },
        'Nominatim refused this client. Set NOMINATIM_USER_AGENT to identify the application with a reachable contact address; placeholder domains such as example.com are rejected.',
      );
      throw upstreamUnavailable(
        'The location service refused this request. An administrator needs to configure a valid NOMINATIM_USER_AGENT.',
      );
    }

    if (response.status === 429) {
      logger?.warn({ status: 429 }, 'Nominatim rate limited this client');
      throw upstreamUnavailable(
        'The location service is temporarily limiting requests. Please wait a moment and try again.',
      );
    }

    if (!response.ok) {
      logger?.warn({ status: response.status }, 'Nominatim returned an error status');
      throw upstreamError('Location lookup failed. Please try again.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      logger?.warn({ err: error }, 'Nominatim returned a non-JSON response');
      throw upstreamError('The location service returned an unexpected response.', error);
    }

    if (!Array.isArray(payload)) {
      logger?.warn('Nominatim returned an unexpected payload shape');
      throw upstreamError('The location service returned an unexpected response.');
    }

    return payload;
  });
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a free-text address to coordinates.
 *
 * @param {object} db
 * @param {string} address  Raw address typed by a curator.
 * @param {{logger?: import('pino').Logger}} [context]
 * @returns {Promise<{latitude: number, longitude: number, displayName: string,
 *   fromCache: boolean, attribution: object}>}
 *
 * @throws {AppError} 404 GEOCODING_NO_RESULTS, 503 upstream unavailable,
 *   504 upstream timeout.
 */
export async function geocodeAddress(db, address, { logger } = {}) {
  const query = String(address).trim();
  if (!query) {
    throw validationError('Enter an address to look up.', [
      { field: 'address', message: 'An address is required.' },
    ]);
  }

  const key = cacheKey(query);

  // A cache hit never touches the network, which is what keeps repeated
  // lookups inside the usage policy.
  const cached = await readCache(db, key);
  if (cached) {
    logger?.debug({ query }, 'Geocoding served from cache');
    return cached;
  }

  const results = await callNominatim(query, { logger });

  if (results.length === 0) {
    throw new AppError(
      404,
      ErrorCodes.GEOCODING_NO_RESULTS,
      'No location matched that address. Try adding a city or postcode.',
    );
  }

  const best = results[0];
  const latitude = roundCoordinate(best.lat);
  const longitude = roundCoordinate(best.lon);

  if (latitude === null || longitude === null) {
    logger?.warn({ query }, 'Nominatim result lacked usable coordinates');
    throw upstreamError('The location service returned an unusable result.');
  }

  const displayName = best.display_name
    ? String(best.display_name).slice(0, config.geocoding.maxResultLabelLength)
    : null;

  await writeCache(db, {
    key,
    query,
    latitude,
    longitude,
    displayName,
    // Only the fields the UI needs are retained; the raw payload is not exposed.
    payload: {
      placeId: best.place_id ?? null,
      osmType: best.osm_type ?? null,
      osmId: best.osm_id ?? null,
      category: best.category ?? null,
      type: best.type ?? null,
      importance: best.importance ?? null,
    },
  });

  logger?.info({ query, latitude, longitude }, 'Geocoding resolved via Nominatim');

  return {
    latitude,
    longitude,
    displayName,
    provider: config.geocoding.provider,
    cachedAt: new Date().toISOString(),
    fromCache: false,
    attribution: OSM_ATTRIBUTION,
  };
}
