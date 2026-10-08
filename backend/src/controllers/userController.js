/**
 * Traveler profile endpoints. Scoped to the signed-in account only — there is
 * no route that exposes another user's private information.
 */
import { getDb } from '../db/index.js';
import * as authService from '../services/authService.js';
import { getAccountOverview } from '../services/userService.js';
import { sendOk } from '../utils/http.js';

export async function getProfile(req, res) {
  const db = await getDb();
  const overview = await getAccountOverview(db, req.user.id);
  return sendOk(res, overview);
}

export async function updateProfile(req, res) {
  const db = await getDb();

  const user = await authService.updateOwnProfile(db, req.user.id, req.valid.body, {
    ipAddress: req.ip ?? null,
    logger: req.log,
  });

  return sendOk(res, { user });
}

export async function changePassword(req, res) {
  const db = await getDb();

  const result = await authService.changeOwnPassword(db, req.user.id, req.valid.body, {
    currentSessionId: req.sessionId,
    ipAddress: req.ip ?? null,
    logger: req.log,
  });

  return sendOk(res, result);
}
