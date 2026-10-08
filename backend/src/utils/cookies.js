/**
 * Session cookie helpers.
 *
 * The session token lives in an httpOnly cookie so that client-side JavaScript
 * (and therefore any XSS payload) cannot read it.
 *
 * Deployment note: when the API and the frontend are on different sites
 * (for example a Vercel frontend calling a Render API), browsers only send the
 * cookie if it is `SameSite=None; Secure`. Set
 * `SESSION_COOKIE_SAMESITE=none` and `SESSION_COOKIE_SECURE=true` in that case,
 * which requires HTTPS. For a same-site deployment, `lax` is the safer default.
 */
import { config } from '../config/env.js';

const baseOptions = () => ({
  httpOnly: true,
  secure: config.session.cookieSecure,
  sameSite: config.session.cookieSameSite,
  path: '/',
});

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(config.session.cookieName, token, {
    ...baseOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, baseOptions());
}

export function readSessionCookie(req) {
  return req.cookies?.[config.session.cookieName] ?? null;
}
