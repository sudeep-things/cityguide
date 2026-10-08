/**
 * Saved place endpoints. Every handler is scoped to the signed-in user, so one
 * traveler can never read or change another's shortlist.
 */
import { getDb } from '../db/index.js';
import * as savedPlaceService from '../services/savedPlaceService.js';
import { sendCreated, sendOk } from '../utils/http.js';

function writeContext(req) {
  return { ipAddress: req.ip ?? null, logger: req.log };
}

export async function listSavedPlaces(req, res) {
  const db = await getDb();
  const result = await savedPlaceService.listSavedPlaces(db, req.user.id, req.valid.query);
  return sendOk(res, result);
}

export async function createSavedPlace(req, res) {
  const db = await getDb();

  const result = await savedPlaceService.saveAttraction(
    db,
    { userId: req.user.id, attractionId: req.valid.body.attractionId },
    writeContext(req),
  );

  return sendCreated(res, result);
}

/** DELETE /saved-places/:id — addressed by the saved-place record's own id. */
export async function deleteSavedPlace(req, res) {
  const db = await getDb();

  const result = await savedPlaceService.removeSavedPlaceById(
    db,
    req.valid.params.id,
    req.user.id,
    writeContext(req),
  );

  return sendOk(res, result);
}

/**
 * DELETE /saved-places/attraction/:attractionId
 *
 * Convenience route for the save/unsave toggle on an attraction card, where the
 * client knows the attraction but not the saved-place record id.
 */
export async function deleteSavedPlaceByAttraction(req, res) {
  const db = await getDb();

  const result = await savedPlaceService.unsaveAttraction(
    db,
    { userId: req.user.id, attractionId: req.valid.params.attractionId },
    writeContext(req),
  );

  return sendOk(res, result);
}
