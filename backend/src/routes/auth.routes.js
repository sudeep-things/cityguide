import { Router } from 'express';
import * as controller from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/http.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(controller.register),
);

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));

router.post('/logout', asyncHandler(controller.logout));

/** Identity probe; responds 200 with `user: null` when signed out. */
router.get('/me', asyncHandler(controller.me));

export default router;
