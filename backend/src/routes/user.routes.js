import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { changePasswordSchema, updateProfileSchema } from '../validators/auth.validators.js';

const router = Router();

// Every profile route acts on the caller's own account only.
router.use(requireAuth);

router.get('/profile', asyncHandler(controller.getProfile));

router.patch(
  '/profile',
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateProfile),
);

router.put(
  '/profile',
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateProfile),
);

router.post(
  '/profile/password',
  validate({ body: changePasswordSchema }),
  asyncHandler(controller.changePassword),
);

export default router;
