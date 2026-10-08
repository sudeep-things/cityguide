/**
 * Audit trail.
 *
 * Records who did what, to which entity, and when. Two design rules:
 *
 *  1. An audit write must never break the user's request. Failures are logged
 *     and swallowed, because losing a log line is preferable to failing an
 *     otherwise valid operation.
 *  2. Callers may pass an open transaction as the executor so the audit row
 *     commits atomically with the change it describes.
 */
import { stringifyJson } from '../utils/serialize.js';

/** Canonical action names. Kept as constants so the UI can filter reliably. */
export const AuditActions = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',

  ATTRACTION_CREATE: 'attraction.create',
  ATTRACTION_UPDATE: 'attraction.update',
  ATTRACTION_DELETE: 'attraction.delete',

  CATEGORY_CREATE: 'category.create',
  CATEGORY_UPDATE: 'category.update',
  CATEGORY_DELETE: 'category.delete',

  SAVED_PLACE_CREATE: 'saved_place.create',
  SAVED_PLACE_DELETE: 'saved_place.delete',

  ITINERARY_CREATE: 'itinerary.create',
  ITINERARY_UPDATE: 'itinerary.update',
  ITINERARY_DELETE: 'itinerary.delete',
  ITINERARY_ITEM_ADD: 'itinerary_item.add',
  ITINERARY_ITEM_REMOVE: 'itinerary_item.remove',
  ITINERARY_ITEM_REORDER: 'itinerary_item.reorder',

  USER_ROLE_CHANGE: 'user.role_change',
  USER_PROFILE_UPDATE: 'user.profile_update',

  GEOCODE_LOOKUP: 'geocode.lookup',
};

/**
 * Writes one audit row.
 *
 * @param {{ execute: Function }} executor Database handle or open transaction.
 * @param {object} entry
 * @param {number|null} entry.userId   Actor; null for anonymous events.
 * @param {string} entry.action        One of `AuditActions`.
 * @param {string} entry.entityType    e.g. 'attraction'.
 * @param {string|number|null} [entry.entityId]
 * @param {object|null} [entry.metadata]
 * @param {string|null} [entry.ipAddress]
 * @param {import('pino').Logger} [entry.logger]
 */
export async function recordAudit(executor, entry) {
  const {
    userId = null,
    action,
    entityType,
    entityId = null,
    metadata = null,
    ipAddress = null,
    logger,
  } = entry;

  try {
    await executor.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entityType,
        entityId === null || entityId === undefined ? null : String(entityId),
        stringifyJson(metadata),
        ipAddress,
      ],
    );
  } catch (error) {
    logger?.warn(
      { err: error, action, entityType, entityId, userId },
      'Failed to write audit log entry',
    );
  }
}
