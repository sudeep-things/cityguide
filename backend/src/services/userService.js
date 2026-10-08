/**
 * Account administration (administrator role only).
 *
 * Two guard rails are enforced here rather than in the UI, because they protect
 * the system from locking itself out:
 *   * the last remaining administrator cannot be demoted or deleted;
 *   * an administrator cannot delete their own account through this endpoint.
 */
import {
  conflict,
  forbidden,
  notFound,
  fromDatabaseError,
  validationError,
} from '../utils/errors.js';
import { resolvePagination } from '../utils/http.js';
import { config } from '../config/env.js';
import { mapAuditLog, mapUser } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';
import { countSavedPlaces } from './savedPlaceService.js';
import { countItineraries } from './itineraryService.js';

const USER_COLUMNS = 'u.id, u.name, u.email, u.role, u.created_at, u.updated_at';

/** Counts active administrators; used by the last-admin guard. */
async function countAdmins(db) {
  const row = await db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
  return Number(row?.total ?? 0);
}

export async function listUsers(db, query = {}) {
  const { search, role } = query;
  const pagination = resolvePagination(query, { defaultLimit: 20, maxLimit: 100 });

  const conditions = [];
  const params = [];

  if (search) {
    const term = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(`(${db.ilike('u.name')} OR ${db.ilike('u.email')})`);
    params.push(term, term);
  }

  if (role) {
    conditions.push('u.role = ?');
    params.push(role);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await db.one(`SELECT COUNT(*) AS total FROM users u ${where}`, params);

  const rows = await db.all(
    `SELECT ${USER_COLUMNS},
            (SELECT COUNT(*) FROM saved_places sp WHERE sp.user_id = u.id)     AS saved_count,
            (SELECT COUNT(*) FROM itineraries i WHERE i.user_id = u.id)        AS itinerary_count
       FROM users u
       ${where}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset],
  );

  const items = rows.map((row) => ({
    ...mapUser(row),
    savedCount: Number(row.saved_count ?? 0),
    itineraryCount: Number(row.itinerary_count ?? 0),
  }));

  return { items, pagination: pagination.buildMeta(countRow?.total ?? 0) };
}

/**
 * Changes another account's role.
 *
 * @throws {AppError} 404 unknown user, 409 when it would remove the last admin.
 */
export async function updateUserRole(db, targetUserId, role, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const target = await db.one('SELECT id, name, email, role FROM users WHERE id = ?', [
    targetUserId,
  ]);
  if (!target) throw notFound('That account could not be found.');

  if (target.role === role) {
    return mapUser(await db.one(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [targetUserId]));
  }

  if (target.role === 'admin' && role !== 'admin') {
    const admins = await countAdmins(db);
    if (admins <= 1) {
      throw conflict(
        'This is the only administrator account. Promote another account before changing this role.',
      );
    }
  }

  try {
    await db.tx(async (tx) => {
      await tx.execute('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [
        role,
        new Date().toISOString(),
        targetUserId,
      ]);

      await recordAudit(tx, {
        userId: actor?.id ?? null,
        action: AuditActions.USER_ROLE_CHANGE,
        entityType: 'user',
        entityId: targetUserId,
        metadata: { from: target.role, to: role, targetEmail: target.email },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  logger?.info({ targetUserId, from: target.role, to: role, actorId: actor?.id ?? null }, 'User role changed');

  return mapUser(await db.one(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [targetUserId]));
}

/**
 * Deletes an account. Saved places, itineraries and stops are removed by
 * ON DELETE CASCADE; authored attractions survive with `created_by` set to NULL.
 */
export async function deleteUser(db, targetUserId, context = {}) {
  const { actor = null, ipAddress = null, logger } = context;

  const target = await db.one('SELECT id, name, email, role FROM users WHERE id = ?', [
    targetUserId,
  ]);
  if (!target) throw notFound('That account could not be found.');

  if (actor && Number(actor.id) === Number(targetUserId)) {
    throw validationError('You cannot delete your own account from the admin dashboard.', [
      { field: 'id', message: 'Delete your own account from the profile page instead.' },
    ]);
  }

  if (target.role === 'admin') {
    const admins = await countAdmins(db);
    if (admins <= 1) {
      throw conflict('This is the only administrator account and cannot be deleted.');
    }
  }

  const impact = await db.one(
    `SELECT (SELECT COUNT(*) FROM saved_places WHERE user_id = ?)  AS saved_count,
            (SELECT COUNT(*) FROM itineraries  WHERE user_id = ?)  AS itinerary_count`,
    [targetUserId, targetUserId],
  );

  await db.tx(async (tx) => {
    await tx.execute('DELETE FROM users WHERE id = ?', [targetUserId]);

    await recordAudit(tx, {
      userId: actor?.id ?? null,
      action: 'user.delete',
      entityType: 'user',
      entityId: targetUserId,
      metadata: {
        email: target.email,
        role: target.role,
        removedSavedPlaces: Number(impact?.saved_count ?? 0),
        removedItineraries: Number(impact?.itinerary_count ?? 0),
      },
      ipAddress,
      logger,
    });
  });

  logger?.warn({ targetUserId, actorId: actor?.id ?? null }, 'User account deleted');
  return { id: Number(targetUserId), email: target.email };
}

/** Personal statistics for the profile page. */
export async function getAccountOverview(db, userId) {
  const [user, savedPlaces, itineraries] = await Promise.all([
    db.one(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [userId]),
    countSavedPlaces(db, userId),
    countItineraries(db, userId),
  ]);

  if (!user) throw notFound('That account could not be found.');

  return {
    user: mapUser(user),
    stats: {
      savedPlaces,
      itineraryCount: itineraries.itineraryCount,
      itineraryStops: itineraries.stopCount,
    },
  };
}

/** Filterable, paginated audit trail for the administrator dashboard. */
export async function listAuditLogs(db, query = {}) {
  const { action, entityType, userId } = query;
  const pagination = resolvePagination(query, { defaultLimit: 25, maxLimit: 100 });

  const conditions = [];
  const params = [];

  if (action) {
    conditions.push('a.action = ?');
    params.push(action);
  }
  if (entityType) {
    conditions.push('a.entity_type = ?');
    params.push(entityType);
  }
  if (userId) {
    conditions.push('a.user_id = ?');
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await db.one(`SELECT COUNT(*) AS total FROM audit_logs a ${where}`, params);

  const rows = await db.all(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.ip_address, a.created_at,
            u.id AS actor_id, u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset],
  );

  return {
    items: rows.map(mapAuditLog),
    pagination: pagination.buildMeta(countRow?.total ?? 0),
  };
}

/** Distinct action names present in the trail, for dashboard filters. */
export async function listAuditActions(db) {
  const rows = await db.all('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC');
  return rows.map((row) => row.action);
}

/** Cross-cutting totals for the administrator overview. */
export async function getSystemStats(db) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const row = await db.one(
    `SELECT (SELECT COUNT(*) FROM users)                                AS total_users,
            (SELECT COUNT(*) FROM users WHERE role = 'traveler')        AS travelers,
            (SELECT COUNT(*) FROM users WHERE role = 'curator')         AS curators,
            (SELECT COUNT(*) FROM users WHERE role = 'admin')           AS admins,
            (SELECT COUNT(*) FROM attractions)                          AS total_attractions,
            (SELECT COUNT(*) FROM categories)                           AS total_categories,
            (SELECT COUNT(*) FROM saved_places)                         AS total_saved_places,
            (SELECT COUNT(*) FROM itineraries)                          AS total_itineraries,
            (SELECT COUNT(*) FROM itinerary_items)                      AS total_itinerary_items,
            (SELECT COUNT(*) FROM audit_logs WHERE created_at >= ?)     AS events_last_24h,
            (SELECT COUNT(*) FROM sessions WHERE expires_at > ?)        AS active_sessions`,
    [since, new Date().toISOString()],
  );

  return {
    users: {
      total: Number(row?.total_users ?? 0),
      travelers: Number(row?.travelers ?? 0),
      curators: Number(row?.curators ?? 0),
      admins: Number(row?.admins ?? 0),
    },
    attractions: Number(row?.total_attractions ?? 0),
    categories: Number(row?.total_categories ?? 0),
    savedPlaces: Number(row?.total_saved_places ?? 0),
    itineraries: Number(row?.total_itineraries ?? 0),
    itineraryItems: Number(row?.total_itinerary_items ?? 0),
    eventsLast24Hours: Number(row?.events_last_24h ?? 0),
    activeSessions: Number(row?.active_sessions ?? 0),
  };
}

/** Guard used by routes that accept a user id in the path. */
export function assertCanManageUser(actor, targetUserId) {
  if (!actor) throw forbidden();
  if (actor.role === 'admin') return;
  if (Number(actor.id) === Number(targetUserId)) return;
  throw forbidden('You can only manage your own account.');
}

export const userConstants = { USER_COLUMNS };
