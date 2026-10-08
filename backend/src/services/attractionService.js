/**
 * Attraction service — the catalogue at the centre of the product.
 *
 * Reads are public. Writes are restricted to curators and administrators, a
 * rule enforced by route middleware before these functions run.
 *
 * The projection below is exported because saved places and itineraries embed
 * the same attraction shape; sharing it keeps every response consistent.
 */
import { notFound, validationError, fromDatabaseError } from '../utils/errors.js';
import { resolvePagination } from '../utils/http.js';
import { config } from '../config/env.js';
import { mapAttraction } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';
import { findCategoryById, resolveCategoryFilter } from './categoryService.js';

/** Whitelisted sort keys -> SQL. A client string is never interpolated. */
const SORT_SQL = {
  newest: 'a.created_at DESC, a.id DESC',
  oldest: 'a.created_at ASC, a.id ASC',
  name_asc: 'a.name ASC',
  name_desc: 'a.name DESC',
  category: 'c.name ASC, a.name ASC',
  recently_updated: 'a.updated_at DESC, a.id DESC',
};

/**
 * Canonical attraction column list. Assumes `attractions a` is the driving
 * table; pair it with `ATTRACTION_JOINS` and, when a viewer is signed in,
 * pass `viewerParamsFor(viewerId)` as the FIRST bound parameters.
 *
 * @param {{viewerId?: number|null}} [options]
 */
export function attractionColumns({ viewerId = null } = {}) {
  const isSaved = viewerId
    ? 'EXISTS (SELECT 1 FROM saved_places sp2 WHERE sp2.attraction_id = a.id AND sp2.user_id = ?) AS is_saved'
    : '0 AS is_saved';

  return `
    a.id,
    a.name,
    a.description,
    a.address,
    a.latitude,
    a.longitude,
    a.image_url,
    a.created_at,
    a.updated_at,
    c.id   AS category_id,
    c.name AS category_name,
    c.slug AS category_slug,
    u.id   AS creator_id,
    u.name AS creator_name,
    (SELECT COUNT(*) FROM saved_places sp WHERE sp.attraction_id = a.id) AS saved_count,
    ${isSaved}
  `;
}

/** Joins required by `attractionColumns`. */
export const ATTRACTION_JOINS = `
  JOIN categories c ON c.id = a.category_id
  LEFT JOIN users u ON u.id = a.created_by
`;

/** Bound parameters for `attractionColumns`; empty when anonymous. */
export function viewerParamsFor(viewerId) {
  return viewerId ? [viewerId] : [];
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Shared WHERE clause for list and count queries. */
function buildFilters(db, { search, categoryId, mapped }) {
  const conditions = [];
  const params = [];

  if (search) {
    const term = `%${escapeLike(search)}%`;
    conditions.push(
      `(${db.ilike('a.name')} OR ${db.ilike('a.description')} OR ${db.ilike('a.address')} OR ${db.ilike('c.name')})`,
    );
    params.push(term, term, term, term);
  }

  if (categoryId) {
    conditions.push('a.category_id = ?');
    params.push(categoryId);
  }

  if (mapped) {
    conditions.push('a.latitude IS NOT NULL AND a.longitude IS NOT NULL');
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Paginated, filterable, sortable attraction list.
 */
export async function listAttractions(db, query, { viewerId = null } = {}) {
  const { search, category, categoryId, sort = 'newest', mapped } = query;

  // A slug filter is resolved to an id before the query is built.
  let resolvedCategoryId = categoryId ?? null;
  let resolvedCategory = null;

  if (!resolvedCategoryId && category) {
    resolvedCategory = await resolveCategoryFilter(db, { category });
    if (!resolvedCategory) {
      // Unknown category: an empty page is more honest than ignoring the filter.
      const pagination = resolvePagination(query, config.pagination);
      return {
        items: [],
        pagination: pagination.buildMeta(0),
        filters: {
          search: search ?? null,
          category: category ?? null,
          categoryId: null,
          sort,
          mapped: mapped ?? false,
        },
      };
    }
    resolvedCategoryId = resolvedCategory.id;
  }

  const { where, params } = buildFilters(db, { search, categoryId: resolvedCategoryId, mapped });

  const countRow = await db.one(
    `SELECT COUNT(*) AS total FROM attractions a JOIN categories c ON c.id = a.category_id ${where}`,
    params,
  );

  const pagination = resolvePagination(query, config.pagination);

  const rows = await db.all(
    `SELECT ${attractionColumns({ viewerId })}
       FROM attractions a
       ${ATTRACTION_JOINS}
       ${where}
       ORDER BY ${SORT_SQL[sort] ?? SORT_SQL.newest}
       LIMIT ? OFFSET ?`,
    [...viewerParamsFor(viewerId), ...params, pagination.limit, pagination.offset],
  );

  return {
    items: rows.map(mapAttraction),
    pagination: pagination.buildMeta(countRow?.total ?? 0),
    filters: {
      search: search ?? null,
      category: resolvedCategory ? resolvedCategory.slug : (category ?? null),
      categoryId: resolvedCategoryId,
      sort,
      mapped: mapped ?? false,
    },
  };
}

export async function getAttractionById(db, id, { viewerId = null } = {}) {
  const row = await db.one(
    `SELECT ${attractionColumns({ viewerId })}
       FROM attractions a
       ${ATTRACTION_JOINS}
      WHERE a.id = ?`,
    [...viewerParamsFor(viewerId), id],
  );
  if (!row) throw notFound('That attraction could not be found.');
  return mapAttraction(row);
}

/** Lightweight lookup used for existence checks before writes. */
export async function findAttractionRow(db, id) {
  return db.one('SELECT id, name, category_id FROM attractions WHERE id = ?', [id]);
}

/**
 * The landing page's featured rail: the most-saved attractions, then the most
 * recent ones so the rail is never empty on a fresh install.
 */
export async function listFeaturedAttractions(db, { limit = 6, viewerId = null } = {}) {
  const rows = await db.all(
    `SELECT ${attractionColumns({ viewerId })},
            (SELECT COUNT(*) FROM saved_places sf WHERE sf.attraction_id = a.id) AS featured_score
       FROM attractions a
       ${ATTRACTION_JOINS}
      ORDER BY featured_score DESC, a.created_at DESC, a.id DESC
      LIMIT ?`,
    [...viewerParamsFor(viewerId), limit],
  );
  return rows.map(mapAttraction);
}

export async function listRecentAttractions(db, { limit = 3, viewerId = null } = {}) {
  const rows = await db.all(
    `SELECT ${attractionColumns({ viewerId })}
       FROM attractions a
       ${ATTRACTION_JOINS}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`,
    [...viewerParamsFor(viewerId), limit],
  );
  return rows.map(mapAttraction);
}

export async function createAttraction(db, input, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const category = await findCategoryById(db, input.categoryId);
  if (!category) {
    throw validationError('The selected category does not exist.', [
      { field: 'categoryId', message: 'Select an existing category.' },
    ]);
  }

  try {
    const created = await db.tx(async (tx) => {
      const row = await tx.one(
        `INSERT INTO attractions
           (name, description, category_id, address, latitude, longitude, image_url, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          input.name,
          input.description,
          input.categoryId,
          input.address,
          input.latitude ?? null,
          input.longitude ?? null,
          input.imageUrl ?? null,
          actor?.id ?? null,
        ],
      );

      await recordAudit(tx, {
        userId: actor?.id ?? null,
        action: AuditActions.ATTRACTION_CREATE,
        entityType: 'attraction',
        entityId: row.id,
        metadata: {
          name: input.name,
          categoryId: input.categoryId,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        },
        ipAddress,
        logger,
      });

      return row;
    });

    logger?.info({ attractionId: created.id, actorId: actor?.id ?? null }, 'Attraction created');
    return getAttractionById(db, created.id, { viewerId: actor?.id ?? null });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }
}

export async function updateAttraction(db, id, patch, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const existing = await db.one(
    'SELECT id, name, category_id, latitude, longitude FROM attractions WHERE id = ?',
    [id],
  );
  if (!existing) throw notFound('That attraction could not be found.');

  if (patch.categoryId !== undefined) {
    const category = await findCategoryById(db, patch.categoryId);
    if (!category) {
      throw validationError('The selected category does not exist.', [
        { field: 'categoryId', message: 'Select an existing category.' },
      ]);
    }
  }

  const columnMap = {
    name: 'name',
    description: 'description',
    categoryId: 'category_id',
    address: 'address',
    latitude: 'latitude',
    longitude: 'longitude',
    imageUrl: 'image_url',
  };

  // Only keys the client actually sent are written; `undefined` means unchanged.
  const assignments = [];
  const values = [];
  const changed = {};

  for (const [key, column] of Object.entries(columnMap)) {
    if (patch[key] !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(patch[key]);
      changed[key] = patch[key];
    }
  }

  if (assignments.length === 0) {
    return getAttractionById(db, id, { viewerId: actor?.id ?? null });
  }

  // Coordinates are a pair: never leave an attraction half-relocated.
  if (changed.latitude !== undefined || changed.longitude !== undefined) {
    const nextLatitude = changed.latitude !== undefined ? changed.latitude : existing.latitude;
    const nextLongitude =
      changed.longitude !== undefined ? changed.longitude : existing.longitude;

    if ((nextLatitude === null) !== (nextLongitude === null)) {
      throw validationError('Latitude and longitude must be updated together.', [
        { field: 'latitude', message: 'Provide both coordinates, or clear both.' },
      ]);
    }
  }

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  try {
    await db.tx(async (tx) => {
      await tx.execute(`UPDATE attractions SET ${assignments.join(', ')} WHERE id = ?`, values);

      await recordAudit(tx, {
        userId: actor?.id ?? null,
        action: AuditActions.ATTRACTION_UPDATE,
        entityType: 'attraction',
        entityId: id,
        metadata: { changed },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  logger?.info({ attractionId: id, actorId: actor?.id ?? null }, 'Attraction updated');
  return getAttractionById(db, id, { viewerId: actor?.id ?? null });
}

/**
 * Deletes an attraction. Saved places and itinerary stops referencing it are
 * removed by ON DELETE CASCADE, so the impact is measured first and reported.
 */
export async function deleteAttraction(db, id, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const existing = await db.one('SELECT id, name FROM attractions WHERE id = ?', [id]);
  if (!existing) throw notFound('That attraction could not be found.');

  const impact = await db.one(
    `SELECT (SELECT COUNT(*) FROM saved_places    WHERE attraction_id = ?) AS saved_count,
            (SELECT COUNT(*) FROM itinerary_items WHERE attraction_id = ?) AS itinerary_count`,
    [id, id],
  );

  await db.tx(async (tx) => {
    await tx.execute('DELETE FROM attractions WHERE id = ?', [id]);
    await recordAudit(tx, {
      userId: actor?.id ?? null,
      action: AuditActions.ATTRACTION_DELETE,
      entityType: 'attraction',
      entityId: id,
      metadata: {
        name: existing.name,
        removedSavedPlaces: Number(impact?.saved_count ?? 0),
        removedItineraryItems: Number(impact?.itinerary_count ?? 0),
      },
      ipAddress,
      logger,
    });
  });

  logger?.info({ attractionId: id, actorId: actor?.id ?? null }, 'Attraction deleted');

  return {
    id: Number(id),
    name: existing.name,
    removedSavedPlaces: Number(impact?.saved_count ?? 0),
    removedItineraryItems: Number(impact?.itinerary_count ?? 0),
  };
}

/** Aggregate figures for the curator and administrator dashboards. */
export async function getAttractionStats(db) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const row = await db.one(
    `SELECT (SELECT COUNT(*) FROM attractions)                        AS total_attractions,
            (SELECT COUNT(*) FROM attractions WHERE latitude IS NULL) AS unmapped_attractions,
            (SELECT COUNT(*) FROM categories)                         AS total_categories,
            (SELECT COUNT(*) FROM attractions WHERE created_at >= ?)  AS created_last_30_days`,
    [since],
  );

  return {
    totalAttractions: Number(row?.total_attractions ?? 0),
    unmappedAttractions: Number(row?.unmapped_attractions ?? 0),
    totalCategories: Number(row?.total_categories ?? 0),
    createdLast30Days: Number(row?.created_last_30_days ?? 0),
  };
}
