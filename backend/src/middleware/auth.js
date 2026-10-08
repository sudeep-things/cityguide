/**
 * Authentication and role-based authorization.
 *
 * `attachSession` runs on every request and resolves the session cookie to a
 * user, so downstream middleware and controllers can rely on `req.user`.
 *
 * Authorization is enforced here and in the services — never in the browser.
 * Hiding a button in the UI is a usability decision, not a security boundary;
 * every protected route re-checks the caller's role server-side.
 */
import { getDb } from '../db/index.js';
import { resolveSession } from '../services/authService.js';
import { forbidden, unauthenticated } from '../utils/errors.js';
import { clearSessionCookie, readSessionCookie } from '../utils/cookies.js';

/** Roles recognised by the system. */
export const ROLES = Object.freeze({
  TRAVELER: 'traveler',
  CURATOR: 'curator',
  ADMIN: 'admin',
});

/**
 * Resolves the session cookie into `req.user` when it is present and valid.
 * Never rejects the request: anonymous access is legitimate for public reads.
 */
export async function attachSession(req, res, next) {
  req.user = null;
  req.sessionId = null;
  req.sessionToken = null;

  const token = readSessionCookie(req);
  if (!token) return next();

  req.sessionToken = token;

  try {
    const db = await getDb();
    const session = await resolveSession(db, token);

    if (session) {
      req.user = session.user;
      req.sessionId = session.sessionId;
    } else {
      // Unknown or expired: clear the stale cookie so the browser stops sending it.
      clearSessionCookie(res);
    }
  } catch (error) {
    return next(error);
  }

  return next();
}

/** Rejects anonymous callers with 401. */
export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthenticated());
  return next();
}

/** Rejects authenticated callers whose role is not listed, with 403. */
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(unauthenticated());
    if (!roles.includes(req.user.role)) {
      return next(
        forbidden(
          `This action requires the ${roles.join(' or ')} role. Your account is a ${req.user.role}.`,
        ),
      );
    }
    return next();
  };
}

/** Content management: curators and administrators. */
export const requireCurator = requireRole(ROLES.CURATOR, ROLES.ADMIN);

/** System administration: administrators only. */
export const requireAdmin = requireRole(ROLES.ADMIN);

/** True when the caller may act on another user's private record. */
export function isAdmin(req) {
  return req.user?.role === ROLES.ADMIN;
}
