/**
 * Row -> API shape mappers.
 *
 * Services always return these shapes, never raw database rows. That keeps
 * internal column names out of the public contract and gives one place to
 * enforce what is exposed (for example, `password_hash` is never mapped).
 */
import { parseJson, toIso } from '../utils/serialize.js';

/** Public representation of an account. Password material is never included. */
export function mapUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Compact author reference attached to attractions and audit entries. */
export function mapUserRef(row, prefix = '') {
  const id = row[`${prefix}id`];
  if (id === null || id === undefined) return null;
  return { id: Number(id), name: row[`${prefix}name`] ?? null };
}

export function mapCategory(row) {
  if (!row) return null;
  const category = {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    createdAt: toIso(row.created_at),
  };
  if (row.attraction_count !== undefined) {
    category.attractionCount = Number(row.attraction_count ?? 0);
  }
  return category;
}

/**
 * Attraction with its category, creator and save statistics folded in.
 * `isSaved` is only present when the request carried an authenticated viewer.
 */
export function mapAttraction(row) {
  if (!row) return null;

  const attraction = {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    address: row.address,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    imageUrl: row.image_url ?? null,
    category: {
      id: Number(row.category_id),
      name: row.category_name,
      slug: row.category_slug,
    },
    createdBy: mapUserRef(row, 'creator_'),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };

  if (row.saved_count !== undefined) attraction.savedCount = Number(row.saved_count ?? 0);
  if (row.is_saved !== undefined) attraction.isSaved = Boolean(row.is_saved);

  return attraction;
}

export function mapItinerary(row) {
  if (!row) return null;
  const itinerary = {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  if (row.item_count !== undefined) itinerary.itemCount = Number(row.item_count ?? 0);
  if (row.user_id !== undefined) itinerary.userId = Number(row.user_id);
  return itinerary;
}

/**
 * A stop inside an itinerary. The row is expected to carry the itinerary item
 * columns under an `item_` prefix (so they cannot collide with the embedded
 * attraction's own `id`, `created_at`, and so on).
 */
export function mapItineraryItem(row) {
  if (!row) return null;
  return {
    id: Number(row.item_id),
    itineraryId: Number(row.item_itinerary_id),
    position: Number(row.position),
    createdAt: toIso(row.item_created_at),
    updatedAt: toIso(row.item_updated_at),
    attraction: mapAttraction(row),
  };
}

/**
 * A saved place. The row carries `saved_place_id` / `saved_at` alongside the
 * standard attraction columns.
 */
export function mapSavedPlace(row) {
  if (!row) return null;
  return {
    id: Number(row.saved_place_id),
    savedAt: toIso(row.saved_at),
    attraction: mapAttraction(row),
  };
}

export function mapAuditLog(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    metadata: parseJson(row.metadata),
    ipAddress: row.ip_address ?? null,
    createdAt: toIso(row.created_at),
    actor: row.actor_id ? { id: Number(row.actor_id), name: row.actor_name ?? null } : null,
  };
}
