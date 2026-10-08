/**
 * Session token generation and hashing.
 *
 * The browser receives a 256-bit random token in an httpOnly cookie. The
 * database stores only its SHA-256 digest, so read access to the `sessions`
 * table is not enough to impersonate a user. SHA-256 (not scrypt) is correct
 * here: the token is already high-entropy, so there is nothing to brute force.
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** @returns {string} URL-safe random session token. */
export function generateSessionToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** @returns {string} Hex SHA-256 digest used as the lookup key. */
export function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Computes the absolute expiry instant for a new session. */
export function sessionExpiry(ttlHours) {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}

/** Random opaque identifier for correlating log lines. */
export function generateRequestId() {
  return randomBytes(8).toString('hex');
}
