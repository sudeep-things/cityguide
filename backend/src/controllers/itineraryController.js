/**
 * Itinerary endpoints.
 *
 * All routes require authentication. Ownership is asserted in the service layer
 * (and administrators may read any itinerary), so a traveler can never reach
 * another traveler's plan even by guessing its id.
 */
import { getDb } from '../db/index.js';
import * as itineraryService from '../services/itineraryService.js';
import { sendCreated, sendOk } from '../utils/http.js';

/** Viewer identity used by the service's ownership check. */
function viewer(req) {
  return {
    viewerId: req.user.id,
    isAdmin: req.user.role === 'admin',
  };
}

function writeContext(req) {
  return { ipAddress: req.ip ?? null, logger: req.log };
}

export async function listItineraries(req, res) {
  const db = await getDb();
  const items = await itineraryService.listItineraries(db, req.user.id);
  return sendOk(res, { items });
}

export async function getItinerary(req, res) {
  const db = await getDb();
  const result = await itineraryService.getItineraryDetail(db, req.valid.params.id, viewer(req));
  return sendOk(res, result);
}

export async function createItinerary(req, res) {
  const db = await getDb();

  const itinerary = await itineraryService.createItinerary(
    db,
    { userId: req.user.id, ...req.valid.body },
    writeContext(req),
  );

  return sendCreated(res, { itinerary });
}

export async function updateItinerary(req, res) {
  const db = await getDb();

  const itinerary = await itineraryService.updateItinerary(
    db,
    req.valid.params.id,
    req.valid.body,
    { ...viewer(req), context: writeContext(req) },
  );

  return sendOk(res, { itinerary });
}

/** PUT — full replacement of name and description. */
export async function replaceItinerary(req, res) {
  const db = await getDb();

  const itinerary = await itineraryService.updateItinerary(
    db,
    req.valid.params.id,
    { name: req.valid.body.name, description: req.valid.body.description ?? null },
    { ...viewer(req), context: writeContext(req) },
  );

  return sendOk(res, { itinerary });
}

export async function deleteItinerary(req, res) {
  const db = await getDb();

  const result = await itineraryService.deleteItinerary(db, req.valid.params.id, {
    ...viewer(req),
    context: writeContext(req),
  });

  return sendOk(res, { deleted: result });
}

/** Ordered stops for an itinerary. */
export async function listItineraryItems(req, res) {
  const db = await getDb();

  // Reuses the ownership check, so an unauthorized caller cannot list stops.
  await itineraryService.getItineraryForViewer(db, req.valid.params.id, viewer(req));
  const items = await itineraryService.getItineraryItems(db, req.valid.params.id, {
    viewerId: req.user.id,
  });

  return sendOk(res, { items });
}

export async function addItineraryItem(req, res) {
  const db = await getDb();

  const result = await itineraryService.addItineraryItem(
    db,
    req.valid.params.id,
    req.valid.body,
    { ...viewer(req), context: writeContext(req) },
  );

  return sendCreated(res, result);
}

export async function removeItineraryItem(req, res) {
  const db = await getDb();

  const result = await itineraryService.removeItineraryItem(
    db,
    req.valid.params.id,
    req.valid.params.itemId,
    { ...viewer(req), context: writeContext(req) },
  );

  return sendOk(res, result);
}

/** PATCH and PUT both accept the complete new order. */
export async function reorderItineraryItems(req, res) {
  const db = await getDb();

  const result = await itineraryService.reorderItineraryItems(
    db,
    req.valid.params.id,
    req.valid.body.itemIds,
    { ...viewer(req), context: writeContext(req) },
  );

  return sendOk(res, result);
}
