import { Router } from 'express';
import * as controller from '../controllers/locationController.js';
import { requireCurator } from '../middleware/auth.js';
import { geocodeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { geocodeRequestSchema } from '../validators/itinerary.validators.js';

const router = Router();

/**
 * Address lookup for curators. Deliberately user-triggered and rate limited:
 * this is the only path to Nominatim, and the service is a shared public
 * resource with a one-request-per-second policy.
 */
router.post(
  '/geocode',
  requireCurator,
  geocodeLimiter,
  validate({ body: geocodeRequestSchema }),
  asyncHandler(controller.geocode),
);

/** Attribution string that clients rendering geocoded data must display. */
router.get('/attribution', asyncHandler(controller.attribution));

export default router;
