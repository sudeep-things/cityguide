/**
 * Itinerary service — private, ordered, persistent day plans.
 *
 * Ordering is stored in `itinerary_items.position` and the table carries
 * UNIQUE (itinerary_id, position), so two stops can never claim the same slot.
 * Reordering therefore works by shifting every row in the itinerary into a
 * high, collision-free band and then assigning the final indices, all inside a
 * single transaction. Either the whole new order is committed or none of it is.
 */
import {
  forbidden,
  notFound,
  validationError,
  duplicateResource,
  fromDatabaseError,
} from '../utils/errors.js';
import { mapItinerary, mapItineraryItem } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';
import {
  ATTRACTION_JOINS,
  attractionColumns,
  findAttractionRow,
  viewerParamsFor,
} from './attractionService.js';

/**
 * Distance used to move every row out of the way before final positions are
 * assigned. Comfortably larger than the 200-item ceiling enforced by validation.
 */
const POSITION_SHIFT = 1_000_000;

const ITINERARY_SELECT = `
  SELECT i.id,
         i.user_id,
         i.name,
         i.description,
         i.created_at,
         i.updated_at,
         (SELECT COUNT(*) FROM itinerary_items ii WHERE ii.itinerary_id = i.id) AS item_count
    FROM itineraries i
`;

export async function listItineraries(db, userId) {
  const rows = await db.all(
    `${ITINERARY_SELECT} WHERE i.user_id = ? ORDER BY i.updated_at DESC, i.id DESC`,
    [userId],
  );
  return rows.map(mapItinerary);
}

export async function findItineraryRow(db, id) {
  return db.one(`${ITINERARY_SELECT} WHERE i.id = ?`, [id]);
}

/**
 * Loads an itinerary and asserts the viewer may see it.
 *
 * Ownership is checked here rather than in the route so that every caller —
 * including the admin dashboard — goes through the same gate. A non-owner
 * receives 403 rather than 404: the resource exists, but it is private.
 */
export async function getItineraryForViewer(db, id, { viewerId, isAdmin = false } = {}) {
  const row = await findItineraryRow(db, id);
  if (!row) throw notFound('That itinerary could not be found.');

  const ownerId = Number(row.user_id);
  if (!isAdmin && ownerId !== Number(viewerId)) {
    throw forbidden('That itinerary belongs to another traveler.');
  }

  return row;
}

/** Ordered stops with their attractions embedded. */
export async function getItineraryItems(db, itineraryId, { viewerId = null } = {}) {
  const rows = await db.all(
    `SELECT ii.id            AS item_id,
            ii.itinerary_id  AS item_itinerary_id,
            ii.position      AS position,
            ii.created_at    AS item_created_at,
            ii.updated_at    AS item_updated_at,
            ${attractionColumns({ viewerId })}
       FROM itinerary_items ii
       JOIN attractions a ON a.id = ii.attraction_id
       ${ATTRACTION_JOINS}
      WHERE ii.itinerary_id = ?
      ORDER BY ii.position ASC`,
    [...viewerParamsFor(viewerId), itineraryId],
  );
  return rows.map(mapItineraryItem);
}

/** An itinerary plus its ordered stops, ready to render. */
export async function getItineraryDetail(db, id, { viewerId, isAdmin = false } = {}) {
  const row = await getItineraryForViewer(db, id, { viewerId, isAdmin });
  const items = await getItineraryItems(db, row.id, { viewerId });
  return { itinerary: mapItinerary(row), items };
}

export async function createItinerary(db, { userId, name, description }, context = {}) {
  const { ipAddress = null, logger } = context;

  const created = await db.tx(async (tx) => {
    const row = await tx.one(
      `INSERT INTO itineraries (user_id, name, description)
       VALUES (?, ?, ?)
       RETURNING id, user_id, name, description, created_at, updated_at`,
      [userId, name, description ?? null],
    );

    await recordAudit(tx, {
      userId,
      action: AuditActions.ITINERARY_CREATE,
      entityType: 'itinerary',
      entityId: row.id,
      metadata: { name },
      ipAddress,
      logger,
    });

    return row;
  });

  logger?.info({ itineraryId: created.id, userId }, 'Itinerary created');
  return { ...mapItinerary(created), itemCount: 0 };
}

export async function updateItinerary(db, id, patch, { viewerId, isAdmin = false, context = {} }) {
  const { ipAddress = null, logger } = context;
  const existing = await getItineraryForViewer(db, id, { viewerId, isAdmin });

  const assignments = [];
  const values = [];
  const changed = {};

  if (patch.name !== undefined) {
    assignments.push('name = ?');
    values.push(patch.name);
    changed.name = patch.name;
  }
  if (patch.description !== undefined) {
    assignments.push('description = ?');
    values.push(patch.description);
    changed.description = patch.description;
  }

  if (assignments.length === 0) {
    return mapItinerary(existing);
  }

  const timestamp = new Date().toISOString();
  assignments.push('updated_at = ?');
  values.push(timestamp);
  values.push(id);

  await db.tx(async (tx) => {
    await tx.execute(`UPDATE itineraries SET ${assignments.join(', ')} WHERE id = ?`, values);

    await recordAudit(tx, {
      userId: viewerId ?? null,
      action: AuditActions.ITINERARY_UPDATE,
      entityType: 'itinerary',
      entityId: id,
      metadata: { changed },
      ipAddress,
      logger,
    });
  });

  logger?.info({ itineraryId: id, userId: viewerId }, 'Itinerary updated');
  const refreshed = await findItineraryRow(db, id);
  return mapItinerary(refreshed);
}

export async function deleteItinerary(db, id, { viewerId, isAdmin = false, context = {} }) {
  const { ipAddress = null, logger } = context;
  const existing = await getItineraryForViewer(db, id, { viewerId, isAdmin });

  await db.tx(async (tx) => {
    // itinerary_items rows are removed by ON DELETE CASCADE.
    await tx.execute('DELETE FROM itineraries WHERE id = ?', [id]);

    await recordAudit(tx, {
      userId: viewerId ?? null,
      action: AuditActions.ITINERARY_DELETE,
      entityType: 'itinerary',
      entityId: id,
      metadata: { name: existing.name, itemCount: Number(existing.item_count ?? 0) },
      ipAddress,
      logger,
    });
  });

  logger?.info({ itineraryId: id, userId: viewerId }, 'Itinerary deleted');
  return { id: Number(id) };
}

/**
 * Rewrites every position in an itinerary to match `orderedIds`.
 *
 * Must be called inside an open transaction. The first statement moves all rows
 * into a high band so the final assignment cannot transiently collide with the
 * UNIQUE (itinerary_id, position) constraint.
 */
async function applyOrder(tx, itineraryId, orderedIds, timestamp) {
  await tx.execute(
    'UPDATE itinerary_items SET position = position + ?, updated_at = ? WHERE itinerary_id = ?',
    [POSITION_SHIFT, timestamp, itineraryId],
  );

  for (let index = 0; index < orderedIds.length; index += 1) {
    await tx.execute(
      'UPDATE itinerary_items SET position = ?, updated_at = ? WHERE id = ? AND itinerary_id = ?',
      [index, timestamp, orderedIds[index], itineraryId],
    );
  }
}

/** Current item ids in stored order. */
async function orderedItemIds(tx, itineraryId) {
  const rows = await tx.all(
    'SELECT id FROM itinerary_items WHERE itinerary_id = ? ORDER BY position ASC',
    [itineraryId],
  );
  return rows.map((row) => Number(row.id));
}

/**
 * Appends an attraction, or inserts it at `position` when supplied.
 *
 * @throws {AppError} 404 unknown attraction, 409 already in the itinerary.
 */
export async function addItineraryItem(
  db,
  itineraryId,
  { attractionId, position },
  { viewerId, isAdmin = false, context = {} },
) {
  const { ipAddress = null, logger } = context;
  await getItineraryForViewer(db, itineraryId, { viewerId, isAdmin });

  const attraction = await findAttractionRow(db, attractionId);
  if (!attraction) throw notFound('That attraction could not be found.');

  const duplicate = await db.one(
    'SELECT id FROM itinerary_items WHERE itinerary_id = ? AND attraction_id = ?',
    [itineraryId, attractionId],
  );
  if (duplicate) {
    throw duplicateResource('That attraction is already part of this itinerary.');
  }

  try {
    await db.tx(async (tx) => {
      const timestamp = new Date().toISOString();
      const existingIds = await orderedItemIds(tx, itineraryId);

      // Insert into the high band; applyOrder assigns the final indices.
      const inserted = await tx.one(
        `INSERT INTO itinerary_items (itinerary_id, attraction_id, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        [itineraryId, attractionId, existingIds.length + POSITION_SHIFT, timestamp, timestamp],
      );

      const orderedIds = [...existingIds];
      const insertAt =
        position === undefined
          ? orderedIds.length
          : Math.max(0, Math.min(Number(position), orderedIds.length));
      orderedIds.splice(insertAt, 0, Number(inserted.id));

      await applyOrder(tx, itineraryId, orderedIds, timestamp);
      await tx.execute('UPDATE itineraries SET updated_at = ? WHERE id = ?', [
        timestamp,
        itineraryId,
      ]);

      await recordAudit(tx, {
        userId: viewerId ?? null,
        action: AuditActions.ITINERARY_ITEM_ADD,
        entityType: 'itinerary',
        entityId: itineraryId,
        metadata: {
          attractionId: Number(attractionId),
          attractionName: attraction.name,
          position: insertAt,
        },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  logger?.info({ itineraryId, attractionId, userId: viewerId }, 'Attraction added to itinerary');
  return getItineraryDetail(db, itineraryId, { viewerId, isAdmin });
}

/** Removes a stop and closes the gap so positions stay dense (0..n-1). */
export async function removeItineraryItem(
  db,
  itineraryId,
  itemId,
  { viewerId, isAdmin = false, context = {} },
) {
  const { ipAddress = null, logger } = context;
  await getItineraryForViewer(db, itineraryId, { viewerId, isAdmin });

  await db.tx(async (tx) => {
    const item = await tx.one(
      'SELECT id, attraction_id FROM itinerary_items WHERE id = ? AND itinerary_id = ?',
      [itemId, itineraryId],
    );
    if (!item) throw notFound('That stop is not part of this itinerary.');

    const timestamp = new Date().toISOString();
    await tx.execute('DELETE FROM itinerary_items WHERE id = ? AND itinerary_id = ?', [
      itemId,
      itineraryId,
    ]);

    const remainingIds = await orderedItemIds(tx, itineraryId);
    await applyOrder(tx, itineraryId, remainingIds, timestamp);
    await tx.execute('UPDATE itineraries SET updated_at = ? WHERE id = ?', [
      timestamp,
      itineraryId,
    ]);

    await recordAudit(tx, {
      userId: viewerId ?? null,
      action: AuditActions.ITINERARY_ITEM_REMOVE,
      entityType: 'itinerary',
      entityId: itineraryId,
      metadata: { itemId: Number(itemId), attractionId: Number(item.attraction_id) },
      ipAddress,
      logger,
    });
  });

  logger?.info({ itineraryId, itemId, userId: viewerId }, 'Itinerary item removed');
  return getItineraryDetail(db, itineraryId, { viewerId, isAdmin });
}

/**
 * Applies a complete new order.
 *
 * The request must list every item exactly once. Requiring the whole set makes
 * the operation idempotent and means a partial or stale payload is rejected
 * instead of silently producing a half-reordered plan.
 */
export async function reorderItineraryItems(
  db,
  itineraryId,
  itemIds,
  { viewerId, isAdmin = false, context = {} },
) {
  const { ipAddress = null, logger } = context;
  await getItineraryForViewer(db, itineraryId, { viewerId, isAdmin });

  await db.tx(async (tx) => {
    const existingIds = await orderedItemIds(tx, itineraryId);

    if (itemIds.length !== existingIds.length) {
      throw validationError(
        'The new order must include every stop in this itinerary exactly once.',
        [
          {
            field: 'itemIds',
            message: `Expected ${existingIds.length} item(s) but received ${itemIds.length}.`,
          },
        ],
      );
    }

    const known = new Set(existingIds);
    const unknown = itemIds.filter((id) => !known.has(Number(id)));
    if (unknown.length > 0) {
      throw validationError('The new order references stops that are not in this itinerary.', [
        { field: 'itemIds', message: `Unknown item id(s): ${unknown.join(', ')}.` },
      ]);
    }

    const timestamp = new Date().toISOString();
    await applyOrder(tx, itineraryId, itemIds.map(Number), timestamp);
    await tx.execute('UPDATE itineraries SET updated_at = ? WHERE id = ?', [timestamp, itineraryId]);

    await recordAudit(tx, {
      userId: viewerId ?? null,
      action: AuditActions.ITINERARY_ITEM_REORDER,
      entityType: 'itinerary',
      entityId: itineraryId,
      metadata: { order: itemIds.map(Number) },
      ipAddress,
      logger,
    });
  });

  logger?.info({ itineraryId, userId: viewerId }, 'Itinerary reordered');
  return getItineraryDetail(db, itineraryId, { viewerId, isAdmin });
}

/** Counts used by the traveler profile page. */
export async function countItineraries(db, userId) {
  const row = await db.one(
    `SELECT (SELECT COUNT(*) FROM itineraries WHERE user_id = ?) AS itinerary_count,
            (SELECT COUNT(*) FROM itinerary_items ii
               JOIN itineraries i ON i.id = ii.itinerary_id
              WHERE i.user_id = ?)                                AS stop_count`,
    [userId, userId],
  );

  return {
    itineraryCount: Number(row?.itinerary_count ?? 0),
    stopCount: Number(row?.stop_count ?? 0),
  };
}
