/**
 * Saved places — a traveler's shortlist.
 *
 * The `saved_places` table carries UNIQUE (user_id, attraction_id), so saving
 * is idempotent by construction. This service still pre-checks to turn the
 * constraint violation into a clear message, and maps the constraint error as a
 * backstop for the concurrent case.
 */
import { notFound, duplicateResource, fromDatabaseError } from '../utils/errors.js';
import { resolvePagination } from '../utils/http.js';
import { config } from '../config/env.js';
import { mapSavedPlace } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';
import {
  ATTRACTION_JOINS,
  attractionColumns,
  findAttractionRow,
  viewerParamsFor,
} from './attractionService.js';

/** Saved places with the embedded attraction projection. */
async function selectSavedPlaces(db, { userId, viewerId, limit, offset }) {
  const rows = await db.all(
    `SELECT sp.id AS saved_place_id,
            sp.created_at AS saved_at,
            ${attractionColumns({ viewerId })}
       FROM saved_places sp
       JOIN attractions a ON a.id = sp.attraction_id
       ${ATTRACTION_JOINS}
      WHERE sp.user_id = ?
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT ? OFFSET ?`,
    [...viewerParamsFor(viewerId), userId, limit, offset],
  );
  return rows.map(mapSavedPlace);
}

export async function listSavedPlaces(db, userId, query = {}) {
  const pagination = resolvePagination(query, config.pagination);

  const countRow = await db.one('SELECT COUNT(*) AS total FROM saved_places WHERE user_id = ?', [
    userId,
  ]);

  const items = await selectSavedPlaces(db, {
    userId,
    viewerId: userId,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return { items, pagination: pagination.buildMeta(countRow?.total ?? 0) };
}

/**
 * Saves an attraction for a user.
 *
 * @throws {AppError} 404 when the attraction does not exist,
 *                    409 when it is already saved.
 */
export async function saveAttraction(db, { userId, attractionId }, context = {}) {
  const { ipAddress = null, logger } = context;

  const attraction = await findAttractionRow(db, attractionId);
  if (!attraction) throw notFound('That attraction could not be found.');

  const alreadySaved = await db.one(
    'SELECT id FROM saved_places WHERE user_id = ? AND attraction_id = ?',
    [userId, attractionId],
  );
  if (alreadySaved) {
    throw duplicateResource('That attraction is already in your saved places.');
  }

  try {
    await db.tx(async (tx) => {
      await tx.execute('INSERT INTO saved_places (user_id, attraction_id) VALUES (?, ?)', [
        userId,
        attractionId,
      ]);

      await recordAudit(tx, {
        userId,
        action: AuditActions.SAVED_PLACE_CREATE,
        entityType: 'attraction',
        entityId: attractionId,
        metadata: { attractionName: attraction.name },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  logger?.info({ userId, attractionId }, 'Attraction saved');

  return {
    attractionId: Number(attractionId),
    saved: true,
  };
}

/**
 * Removes a saved attraction. Deleting by (user_id, attraction_id) makes the
 * operation idempotent from the client's point of view and impossible for one
 * user to affect another's shortlist.
 */
export async function unsaveAttraction(db, { userId, attractionId }, context = {}) {
  const { ipAddress = null, logger } = context;

  const existing = await db.one(
    'SELECT id FROM saved_places WHERE user_id = ? AND attraction_id = ?',
    [userId, attractionId],
  );
  if (!existing) throw notFound('That attraction is not in your saved places.');

  await db.tx(async (tx) => {
    await tx.execute('DELETE FROM saved_places WHERE user_id = ? AND attraction_id = ?', [
      userId,
      attractionId,
    ]);

    await recordAudit(tx, {
      userId,
      action: AuditActions.SAVED_PLACE_DELETE,
      entityType: 'attraction',
      entityId: attractionId,
      metadata: null,
      ipAddress,
      logger,
    });
  });

  logger?.info({ userId, attractionId }, 'Attraction unsaved');

  return { attractionId: Number(attractionId), saved: false };
}

/** Removes a saved place addressed by its own id, scoped to the owner. */
export async function removeSavedPlaceById(db, savedPlaceId, userId, context = {}) {
  const existing = await db.one(
    'SELECT id, attraction_id FROM saved_places WHERE id = ? AND user_id = ?',
    [savedPlaceId, userId],
  );
  if (!existing) throw notFound('That saved place could not be found.');

  return unsaveAttraction(
    db,
    { userId, attractionId: Number(existing.attraction_id) },
    context,
  );
}

/** How many attractions a user has saved; used by the profile page. */
export async function countSavedPlaces(db, userId) {
  const row = await db.one('SELECT COUNT(*) AS total FROM saved_places WHERE user_id = ?', [userId]);
  return Number(row?.total ?? 0);
}
