import { Router } from 'express';
import * as controller from '../controllers/adminController.js';
import { requireCurator } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

// Curators and administrators share this dashboard. Backend verification of the
// curator permission happens here, not by hiding the link in the UI.
router.use(requireCurator);

router.get('/overview', asyncHandler(controller.getCuratorOverview));

export default router;
