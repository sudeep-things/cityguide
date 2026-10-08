/**
 * Location lookup endpoint.
 *
 * The browser asks this API, the API asks Nominatim, and a normalised result
 * comes back. The browser never contacts Nominatim directly, which keeps the
 * required User-Agent, the request throttle and the cache effective.
 */
import { getDb } from '../db/index.js';
import { geocodeAddress, OSM_ATTRIBUTION } from '../services/geocodeService.js';
import { AuditActions, recordAudit } from '../services/auditService.js';
import { sendOk } from '../utils/http.js';

export async function geocode(req, res) {
  const db = await getDb();
  const { address } = req.valid.body;

  const result = await geocodeAddress(db, address, { logger: req.log });

  // Lookups are recorded so an operator can see how the shared service is used.
  await recordAudit(db, {
    userId: req.user?.id ?? null,
    action: AuditActions.GEOCODE_LOOKUP,
    entityType: 'location',
    entityId: null,
    metadata: {
      address,
      fromCache: result.fromCache,
      latitude: result.latitude,
      longitude: result.longitude,
    },
    ipAddress: req.ip ?? null,
    logger: req.log,
  });

  return sendOk(res, { location: result, attribution: OSM_ATTRIBUTION });
}

/** Attribution needed by any client that renders geocoded results. */
export async function attribution(req, res) {
  return sendOk(res, { attribution: OSM_ATTRIBUTION });
}
