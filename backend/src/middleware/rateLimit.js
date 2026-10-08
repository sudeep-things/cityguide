/**
 * Rate limiting.
 *
 * Three tiers, each matched to the cost and abuse profile of the endpoint:
 *   * `apiLimiter`     — a generous ceiling for ordinary reads and writes.
 *   * `authLimiter`    — tight, and only failed attempts count, so a legitimate
 *                        user is never locked out by their own successful logins.
 *   * `geocodeLimiter` — tightest, because those requests reach a shared public
 *                        service that the application is a guest on.
 */
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { rateLimited } from '../utils/errors.js';

function buildLimiter({ windowMs, limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    // Route the rejection through the shared error envelope.
    handler(req, res, next) {
      next(rateLimited(message));
    },
  });
}

export const apiLimiter = buildLimiter({
  windowMs: config.rateLimit.apiWindowMs,
  limit: config.rateLimit.apiMax,
  message: 'Too many requests. Please wait a moment and try again.',
});

export const authLimiter = buildLimiter({
  windowMs: config.rateLimit.authWindowMs,
  limit: config.rateLimit.authMax,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  skipSuccessfulRequests: true,
});

export const geocodeLimiter = buildLimiter({
  windowMs: config.rateLimit.geocodeWindowMs,
  limit: config.rateLimit.geocodeMax,
  message: 'Too many location lookups. Please wait a moment before trying again.',
});
