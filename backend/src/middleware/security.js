/**
 * Cross-site request protection.
 *
 * The session cookie is `SameSite=Lax` and `httpOnly`, and the API only accepts
 * JSON bodies, which already blocks the classic cross-site form post. This
 * middleware adds defence in depth by rejecting state-changing requests whose
 * `Origin`/`Referer` is not one this deployment trusts.
 *
 * A missing Origin is allowed on purpose: command-line tools, server-to-server
 * calls and the automated test suite send none, and a browser cannot omit it on
 * a cross-site write. Blocking those would break legitimate non-browser clients
 * without adding protection against the attack this guards against.
 */
import { config } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function verifyRequestOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const header = req.get('origin') || req.get('referer');
  if (!header) return next();

  let source;
  try {
    source = new URL(header).origin;
  } catch {
    return next(forbidden('That request could not be verified.'));
  }

  // Same-origin requests are always acceptable, whatever the host is.
  const host = req.get('host');
  if (host && (source === `http://${host}` || source === `https://${host}`)) return next();

  if (config.cors.origins.includes(source)) return next();

  return next(
    forbidden(`Requests from ${source} are not accepted by this API.`),
  );
}
