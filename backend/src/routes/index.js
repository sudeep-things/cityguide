/**
 * API route table.
 *
 * Everything is mounted under `/api` by `app.js`. Route modules own their own
 * authentication and authorization so a guard can never be forgotten at the
 * mount point.
 */
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { asyncHandler, sendOk } from '../utils/http.js';
import { config } from '../config/env.js';

import authRoutes from './auth.routes.js';
import attractionRoutes from './attraction.routes.js';
import categoryRoutes from './category.routes.js';
import savedPlaceRoutes from './savedPlace.routes.js';
import itineraryRoutes from './itinerary.routes.js';
import locationRoutes from './location.routes.js';
import userRoutes from './user.routes.js';
import curatorRoutes from './curator.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

/** Liveness and readiness probe; also reports which driver is in use. */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const db = await getDb();
    await db.one('SELECT 1 AS ok');

    return sendOk(res, {
      status: 'ok',
      database: db.dialect,
      environment: config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);

router.use('/auth', authRoutes);
router.use('/attractions', attractionRoutes);
router.use('/categories', categoryRoutes);
router.use('/saved-places', savedPlaceRoutes);
router.use('/itineraries', itineraryRoutes);
router.use('/location', locationRoutes);
router.use('/users', userRoutes);
router.use('/curator', curatorRoutes);
router.use('/admin', adminRoutes);

export default router;
