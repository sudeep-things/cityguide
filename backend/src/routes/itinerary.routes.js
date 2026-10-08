import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/itineraryController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { idParam, idParamsSchema } from '../validators/common.js';
import {
  itineraryCreateSchema,
  itineraryItemCreateSchema,
  itineraryReorderSchema,
  itineraryUpdateSchema,
} from '../validators/itinerary.validators.js';

const router = Router();

const itemParamsSchema = z.object({ id: idParam, itemId: idParam });

// Itineraries are private; ownership is asserted in the service on every route.
router.use(requireAuth);

router.get('/', asyncHandler(controller.listItineraries));

router.post(
  '/',
  validate({ body: itineraryCreateSchema }),
  asyncHandler(controller.createItinerary),
);

router.get('/:id', validate({ params: idParamsSchema }), asyncHandler(controller.getItinerary));

router.patch(
  '/:id',
  validate({ params: idParamsSchema, body: itineraryUpdateSchema }),
  asyncHandler(controller.updateItinerary),
);

router.put(
  '/:id',
  validate({ params: idParamsSchema, body: itineraryCreateSchema }),
  asyncHandler(controller.replaceItinerary),
);

router.delete('/:id', validate({ params: idParamsSchema }), asyncHandler(controller.deleteItinerary));

/* Stops -------------------------------------------------------------------- */

router.get(
  '/:id/items',
  validate({ params: idParamsSchema }),
  asyncHandler(controller.listItineraryItems),
);

router.post(
  '/:id/items',
  validate({ params: idParamsSchema, body: itineraryItemCreateSchema }),
  asyncHandler(controller.addItineraryItem),
);

/**
 * Reordering takes the complete new order. Declared before `/:id/items/:itemId`
 * so "order" is never parsed as an item identifier.
 */
router.patch(
  '/:id/items/order',
  validate({ params: idParamsSchema, body: itineraryReorderSchema }),
  asyncHandler(controller.reorderItineraryItems),
);

router.put(
  '/:id/items/order',
  validate({ params: idParamsSchema, body: itineraryReorderSchema }),
  asyncHandler(controller.reorderItineraryItems),
);

router.delete(
  '/:id/items/:itemId',
  validate({ params: itemParamsSchema }),
  asyncHandler(controller.removeItineraryItem),
);

export default router;
