/**
 * Express application assembly.
 *
 * Middleware order matters and is intentional:
 *   1. security headers       — applied to every response, including errors
 *   2. request logging        — so every later failure carries a request id
 *   3. CORS                   — credential-aware allow-list
 *   4. body parsing           — bounded, JSON only
 *   5. cookie parsing         — needed before the session is resolved
 *   6. origin verification    — blocks cross-site writes
 *   7. rate limiting          — before any work is done
 *   8. session resolution     — populates req.user for everything below
 *   9. routes, then 404, then the error handler
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config, paths } from './config/env.js';
import { requestLogger } from './middleware/requestContext.js';
import { attachSession } from './middleware/auth.js';
import { verifyRequestOrigin } from './middleware/security.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { apiNotFoundHandler, errorHandler } from './middleware/error.js';
import apiRoutes from './routes/index.js';

/**
 * Credential-aware CORS.
 *
 * Requests with no Origin (same-origin, curl, server-to-server, the test suite)
 * are always allowed. Cross-origin requests must appear in CORS_ORIGINS, except
 * for localhost during development, where Vite may pick any free port.
 */
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (config.cors.origins.includes(origin)) return callback(null, true);

  if (!config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }

  // Not an error: simply omit the CORS headers so the browser blocks the read.
  return callback(null, false);
}

/**
 * Content Security Policy tuned for this UI: OpenStreetMap raster tiles and
 * remote attraction images must load, and Leaflet injects inline styles.
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...config.cors.origins],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // The API is consumed by a separately hosted SPA.
  crossOriginEmbedderPolicy: false,
};

export function createApp() {
  const app = express();

  // Exactly one proxy hop in front of us on typical PaaS platforms. Using a
  // number (rather than `true`) keeps `req.ip` meaningful and satisfies
  // express-rate-limit's proxy validation.
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet(helmetOptions));
  app.use(requestLogger);
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );

  // Bounded JSON body: large payloads are rejected before any handler runs.
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(verifyRequestOrigin);

  app.use('/api', apiLimiter, attachSession, apiRoutes);

  // Unknown /api paths get the JSON envelope, not the SPA shell.
  app.use('/api', apiNotFoundHandler);

  // In production a single service can host both the API and the built SPA.
  const clientDist = path.resolve(paths.repoRoot, 'frontend', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));

    // SPA fallback: any non-API GET returns index.html so client routing works.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
