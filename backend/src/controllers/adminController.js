/**
 * Administrator and curator dashboard endpoints.
 *
 * Every route that reaches this controller is already gated by `requireAdmin`
 * or `requireCurator`; the role checks below are a second, deliberate layer so
 * that a future route wired up without its guard still fails closed.
 */
import { getDb } from '../db/index.js';
import * as userService from '../services/userService.js';
import * as attractionService from '../services/attractionService.js';
import * as categoryService from '../services/categoryService.js';
import { forbidden } from '../utils/errors.js';
import { sendOk } from '../utils/http.js';
import { ROLES } from '../middleware/auth.js';

function assertRole(req, roles) {
  if (!req.user || !roles.includes(req.user.role)) throw forbidden();
}

/** Curator overview: catalogue health at a glance. */
export async function getCuratorOverview(req, res) {
  assertRole(req, [ROLES.CURATOR, ROLES.ADMIN]);

  const db = await getDb();
  const [stats, categories] = await Promise.all([
    attractionService.getAttractionStats(db),
    categoryService.listCategories(db),
  ]);

  return sendOk(res, {
    stats,
    categories,
    // Surfaces work that needs attention rather than just raw totals.
    needsAttention: {
      attractionsWithoutCoordinates: stats.unmappedAttractions,
      emptyCategories: categories.filter((category) => category.attractionCount === 0).length,
    },
  });
}

/** Administrator overview: totals across the whole system. */
export async function getAdminOverview(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const [system, catalogue, recentActivity] = await Promise.all([
    userService.getSystemStats(db),
    attractionService.getAttractionStats(db),
    userService.listAuditLogs(db, { page: 1, limit: 8 }),
  ]);

  return sendOk(res, {
    system,
    catalogue,
    recentActivity: recentActivity.items,
  });
}

export async function listUsers(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const result = await userService.listUsers(db, req.valid.query);
  return sendOk(res, result);
}

export async function updateUserRole(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const user = await userService.updateUserRole(db, req.valid.params.id, req.valid.body.role, {
    actor: req.user,
    ipAddress: req.ip ?? null,
    logger: req.log,
  });

  return sendOk(res, { user });
}

export async function deleteUser(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const result = await userService.deleteUser(db, req.valid.params.id, {
    actor: req.user,
    ipAddress: req.ip ?? null,
    logger: req.log,
  });

  return sendOk(res, { deleted: result });
}

export async function listAuditLogs(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const result = await userService.listAuditLogs(db, req.valid.query);
  return sendOk(res, result);
}

export async function listAuditActions(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const actions = await userService.listAuditActions(db);
  return sendOk(res, { actions });
}

/**
 * Administrator view of every itinerary in the system, for oversight.
 * Travelers never reach this: it is admin-gated and read-only.
 */
export async function listAllItineraries(req, res) {
  assertRole(req, [ROLES.ADMIN]);

  const db = await getDb();
  const result = await userService.listUsers(db, {
    page: req.valid.query.page,
    limit: req.valid.query.limit,
  });

  // Itinerary counts already come back with each user row, which is all the
  // oversight table needs without exposing private plan contents.
  return sendOk(res, {
    items: result.items.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      itineraryCount: user.itineraryCount,
      savedCount: user.savedCount,
    })),
    pagination: result.pagination,
  });
}

/** Read-only convenience used by the admin attractions table. */
export async function getCatalogueStats(req, res) {
  assertRole(req, [ROLES.ADMIN, ROLES.CURATOR]);

  const db = await getDb();
  const stats = await attractionService.getAttractionStats(db);
  const itineraryCount = await db.one('SELECT COUNT(*) AS total FROM itineraries');

  return sendOk(res, {
    stats,
    totalItineraries: Number(itineraryCount?.total ?? 0),
  });
}
