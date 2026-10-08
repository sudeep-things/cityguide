/**
 * Value normalisation shared by the API layer.
 *
 * The two supported drivers disagree about types: PostgreSQL hands back `Date`
 * objects for timestamps while SQLite returns ISO strings, and JSONB comes
 * back already parsed while SQLite stores TEXT. These helpers make every row
 * look the same before it leaves the data layer, so mappers and controllers
 * never branch on dialect.
 */

/** Coerces `Date | string | null` into an ISO-8601 UTC string. */
export function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return value;
}

/**
 * Parses a JSON column. PostgreSQL returns an object, SQLite a string, and a
 * NULL column stays null.
 */
export function parseJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Serialises a value for storage in a JSON/JSONB column. */
export function stringifyJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/** Trims a string and collapses internal runs of whitespace. */
export function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive key for cache lookups. */
export function cacheKey(...parts) {
  return collapseWhitespace(parts.filter(Boolean).join(' | ')).toLowerCase();
}

/**
 * Converts a human label into a URL-safe slug: "Food & Drink" -> "food-drink".
 */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Rounds a coordinate to 6 decimal places (~11 cm), which is the precision
 * Nominatim returns and is plenty for a map pin.
 */
export function roundCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 1e6) / 1e6;
}
