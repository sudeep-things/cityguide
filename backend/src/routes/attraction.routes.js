import { Router } from 'express';
import * as controller from '../controllers/attractionController.js';
import { requireCurator } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { idParamsSchema } from '../validators/common.js';
import {
  attractionCreateSchema,
  attractionListQuerySchema,
  attractionUpdateSchema,
} from '../validators/attraction.validators.js';

const router = Router();

/* Public reads ------------------------------------------------------------- */

router.get(
  '/',
  validate({ query: attractionListQuerySchema }),
  asyncHandler(controller.listAttractions),
);

// Declared before `/:id` so these literal paths are never read as identifiers.
router.get('/featured', asyncHandler(controller.listFeaturedAttractions));
router.get('/recent', asyncHandler(controller.listRecentAttractions));

/* Curator operations ------------------------------------------------------- */

router.get('/stats', requireCurator, asyncHandler(controller.getAttractionStats));

router.post(
  '/',
  requireCurator,
  validate({ body: attractionCreateSchema }),
  asyncHandler(controller.createAttraction),
);

/* Parameterised routes ----------------------------------------------------- */

router.get(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(controller.getAttraction),
);

/** PATCH updates only the supplied fields. */
router.patch(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema, body: attractionUpdateSchema }),
  asyncHandler(controller.updateAttraction),
);

/** PUT replaces the resource; absent optional fields are cleared. */
router.put(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema, body: attractionCreateSchema }),
  asyncHandler(controller.replaceAttraction),
);

router.delete(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema }),
  asyncHandler(controller.deleteAttraction),
);

export default router;
