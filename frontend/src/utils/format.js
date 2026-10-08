/**
 * Small presentation helpers shared across the UI.
 */

/** Formats an ISO timestamp as a readable date. */
export function formatDate(value, options) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

/** Formats an ISO timestamp with the time of day included. */
export function formatDateTime(value) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

/** "3 days ago" style relative time, for activity feeds. */
export function formatRelative(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  let duration = seconds;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatDate(value);
}

/** Formats a coordinate pair for display, or a placeholder when absent. */
export function formatCoordinates(latitude, longitude, precision = 5) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
}

/**
 * Great-circle distance in kilometres between two coordinates.
 *
 * Uses stored coordinates only — no external service is consulted. Useful for
 * showing how far apart the stops in an itinerary are.
 */
export function distanceInKm(from, to) {
  if (
    typeof from?.latitude !== 'number' ||
    typeof from?.longitude !== 'number' ||
    typeof to?.latitude !== 'number' ||
    typeof to?.longitude !== 'number'
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** Formats a distance for display. */
export function formatDistance(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Initials for an avatar, e.g. "Sam Rivera" -> "SR". */
export function initialsOf(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Human-readable labels for the role enum. */
export const ROLE_LABELS = {
  traveler: 'Traveler',
  curator: 'Curator',
  admin: 'Administrator',
};

/** Human-readable labels for audit actions. */
export function humaniseAction(action) {
  if (!action) return '—';
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' · ')
    .replace(/^\w/, (character) => character.toUpperCase());
}

/** Copies text to the clipboard, reporting whether it succeeded. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Joins class names, dropping falsy values. */
export function classNames(...values) {
  return values.filter(Boolean).join(' ');
}
