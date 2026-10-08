import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/savedPlaceController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { idParam, idParamsSchema, paginationSchema } from '../validators/common.js';
import { savedPlaceCreateSchema } from '../validators/itinerary.validators.js';

const router = Router();

// A traveler's shortlist is private: every route requires a session and is
// scoped to that account in the service layer.
router.use(requireAuth);

router.get(
  '/',
  validate({ query: paginationSchema }),
  asyncHandler(controller.listSavedPlaces),
);

router.post(
  '/',
  validate({ body: savedPlaceCreateSchema }),
  asyncHandler(controller.createSavedPlace),
);

/** Toggle helper: unsave using the attraction id. Declared before `/:id`. */
router.delete(
  '/attraction/:attractionId',
  validate({ params: z.object({ attractionId: idParam }) }),
  asyncHandler(controller.deleteSavedPlaceByAttraction),
);

router.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(controller.deleteSavedPlace),
);

export default router;
