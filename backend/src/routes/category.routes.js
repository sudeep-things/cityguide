import { Router } from 'express';
import * as controller from '../controllers/categoryController.js';
import { requireCurator } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { idParamsSchema } from '../validators/common.js';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
} from '../validators/attraction.validators.js';

const router = Router();

router.get('/', asyncHandler(controller.listCategories));

router.get('/:id', validate({ params: idParamsSchema }), asyncHandler(controller.getCategory));

router.post(
  '/',
  requireCurator,
  validate({ body: categoryCreateSchema }),
  asyncHandler(controller.createCategory),
);

router.patch(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema, body: categoryUpdateSchema }),
  asyncHandler(controller.updateCategory),
);

router.put(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema, body: categoryCreateSchema }),
  asyncHandler(controller.replaceCategory),
);

router.delete(
  '/:id',
  requireCurator,
  validate({ params: idParamsSchema }),
  asyncHandler(controller.deleteCategory),
);

export default router;
