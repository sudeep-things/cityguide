import { Router } from 'express';
import * as controller from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { idParamsSchema, paginationSchema } from '../validators/common.js';
import {
  updateUserRoleSchema,
  userListQuerySchema,
} from '../validators/auth.validators.js';
import { auditLogQuerySchema } from '../validators/itinerary.validators.js';

const router = Router();

// Administrators only. The controller re-checks the role as a second layer.
router.use(requireAdmin);

router.get('/overview', asyncHandler(controller.getAdminOverview));

router.get(
  '/users',
  validate({ query: userListQuerySchema }),
  asyncHandler(controller.listUsers),
);

router.patch(
  '/users/:id/role',
  validate({ params: idParamsSchema, body: updateUserRoleSchema }),
  asyncHandler(controller.updateUserRole),
);

router.put(
  '/users/:id/role',
  validate({ params: idParamsSchema, body: updateUserRoleSchema }),
  asyncHandler(controller.updateUserRole),
);

router.delete('/users/:id', validate({ params: idParamsSchema }), asyncHandler(controller.deleteUser));

router.get(
  '/audit-logs',
  validate({ query: auditLogQuerySchema }),
  asyncHandler(controller.listAuditLogs),
);

router.get('/audit-logs/actions', asyncHandler(controller.listAuditActions));

/** Per-user totals used by the oversight tables. */
router.get(
  '/itinerary-oversight',
  validate({ query: paginationSchema }),
  asyncHandler(controller.listAllItineraries),
);

router.get('/catalogue-stats', asyncHandler(controller.getCatalogueStats));

export default router;
