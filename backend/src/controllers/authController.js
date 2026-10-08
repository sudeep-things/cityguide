/**
 * Authentication endpoints.
 *
 * The session token is delivered only as an httpOnly cookie — never in the
 * response body — so no client-side script can read it.
 */
import { getDb } from '../db/index.js';
import * as authService from '../services/authService.js';
import { clearSessionCookie, setSessionCookie } from '../utils/cookies.js';
import { sendCreated, sendOk } from '../utils/http.js';
import { getAccountOverview } from '../services/userService.js';

function requestContext(req) {
  return {
    userAgent: req.get('user-agent') ?? null,
    ipAddress: req.ip ?? null,
    logger: req.log,
  };
}

export async function register(req, res) {
  const db = await getDb();
  const { user, session } = await authService.registerUser(
    db,
    req.valid.body,
    requestContext(req),
  );

  setSessionCookie(res, session.token, session.expiresAt);
  return sendCreated(res, { user });
}

export async function login(req, res) {
  const db = await getDb();
  const { user, session } = await authService.authenticateUser(
    db,
    req.valid.body,
    requestContext(req),
  );

  setSessionCookie(res, session.token, session.expiresAt);
  return sendOk(res, { user });
}

export async function logout(req, res) {
  const db = await getDb();

  if (req.sessionToken) {
    await authService.destroySession(db, req.sessionToken);
  }

  clearSessionCookie(res);
  req.log?.info({ userId: req.user?.id ?? null }, 'User signed out');

  return sendOk(res, { signedOut: true });
}

/**
 * Returns the current identity. Responds 200 with `user: null` when nobody is
 * signed in, so the frontend can probe session state at boot without treating
 * the expected anonymous case as an error.
 */
export async function me(req, res) {
  if (!req.user) {
    return sendOk(res, { authenticated: false, user: null });
  }

  const db = await getDb();
  const overview = await getAccountOverview(db, req.user.id);

  return sendOk(res, {
    authenticated: true,
    user: overview.user,
    stats: overview.stats,
  });
}
