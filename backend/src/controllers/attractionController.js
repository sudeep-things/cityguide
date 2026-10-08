/**
 * Attraction endpoints.
 *
 * Reads are public and enriched with the viewer's own save state when a session
 * is present. Writes are gated by `requireCurator` at the route level, so these
 * handlers can assume the caller is a curator or administrator.
 */
import { getDb } from '../db/index.js';
import * as attractionService from '../services/attractionService.js';
import { sendCreated, sendOk } from '../utils/http.js';

/** Actor/audit context shared by the write handlers. */
function writeContext(req) {
  return {
    actor: req.user,
    ipAddress: req.ip ?? null,
    logger: req.log,
  };
}

export async function listAttractions(req, res) {
  const db = await getDb();
  const viewerId = req.user?.id ?? null;

  const result = await attractionService.listAttractions(db, req.valid.query, { viewerId });
  return sendOk(res, result);
}

/** Landing page rail: most-saved attractions. */
export async function listFeaturedAttractions(req, res) {
  const db = await getDb();
  const limit = Math.min(Number(req.query.limit) || 6, 12);

  const items = await attractionService.listFeaturedAttractions(db, {
    limit,
    viewerId: req.user?.id ?? null,
  });

  return sendOk(res, { items });
}

export async function listRecentAttractions(req, res) {
  const db = await getDb();
  const limit = Math.min(Number(req.query.limit) || 3, 12);

  const items = await attractionService.listRecentAttractions(db, {
    limit,
    viewerId: req.user?.id ?? null,
  });

  return sendOk(res, { items });
}

export async function getAttraction(req, res) {
  const db = await getDb();

  const attraction = await attractionService.getAttractionById(db, req.valid.params.id, {
    viewerId: req.user?.id ?? null,
  });

  return sendOk(res, { attraction });
}

export async function createAttraction(req, res) {
  const db = await getDb();

  const attraction = await attractionService.createAttraction(
    db,
    req.valid.body,
    writeContext(req),
  );

  return sendCreated(res, { attraction });
}

/** PATCH — partial update; omitted fields are left untouched. */
export async function updateAttraction(req, res) {
  const db = await getDb();

  const attraction = await attractionService.updateAttraction(
    db,
    req.valid.params.id,
    req.valid.body,
    writeContext(req),
  );

  return sendOk(res, { attraction });
}

/**
 * PUT — full replacement. Optional fields that are absent from the body are
 * cleared, which is the behaviour HTTP semantics call for.
 */
export async function replaceAttraction(req, res) {
  const db = await getDb();
  const input = req.valid.body;

  const attraction = await attractionService.updateAttraction(
    db,
    req.valid.params.id,
    {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      address: input.address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      imageUrl: input.imageUrl ?? null,
    },
    writeContext(req),
  );

  return sendOk(res, { attraction });
}

export async function deleteAttraction(req, res) {
  const db = await getDb();

  const result = await attractionService.deleteAttraction(
    db,
    req.valid.params.id,
    writeContext(req),
  );

  return sendOk(res, { deleted: result });
}

/** Aggregate counts for the curator dashboard header. */
export async function getAttractionStats(req, res) {
  const db = await getDb();
  const stats = await attractionService.getAttractionStats(db);
  return sendOk(res, { stats });
}
