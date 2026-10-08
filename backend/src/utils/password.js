/**
 * Password hashing.
 *
 * Uses scrypt, a memory-hard key derivation function built into Node's
 * `crypto` module — no native compilation and no third-party crypto. Every
 * password gets a fresh 16-byte random salt and is normalised to NFKC first so
 * that visually identical Unicode passwords hash identically.
 *
 * Stored format (self-describing, so parameters can be raised later without
 * invalidating existing hashes):
 *
 *   scrypt$N$r$p$<base64 salt>$<base64 derived key>
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/** Cost parameters. N=2^14 with r=8 needs ~16 MiB and ~50-100 ms. */
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const ALGORITHM = 'scrypt';

/** scrypt's memory requirement is 128 * N * r bytes; allow headroom. */
const MAX_MEMORY = 128 * PARAMS.N * PARAMS.r * 2;

function normalise(password) {
  return String(password).normalize('NFKC');
}

/**
 * @param {string} password Plaintext password (never logged or stored).
 * @returns {Promise<string>} Encoded hash safe to persist.
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(normalise(password), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });

  return [
    ALGORITHM,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash in constant time.
 *
 * A malformed or unrecognised hash returns false rather than throwing, so a
 * corrupted row can never be used to probe the login endpoint.
 *
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const N = Number.parseInt(n, 10);
  const rValue = Number.parseInt(r, 10);
  const pValue = Number.parseInt(p, 10);
  if (!Number.isFinite(N) || !Number.isFinite(rValue) || !Number.isFinite(pValue)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(keyB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(normalise(password), salt, expected.length, {
      N,
      r: rValue,
      p: pValue,
      maxmem: 128 * N * rValue * 2,
    });

    // Lengths match by construction; timingSafeEqual still requires it.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Runs a dummy verification so that a login attempt for a non-existent email
 * costs roughly the same as one for an existing account. Without this, response
 * timing reveals which addresses are registered.
 */
const DUMMY_HASH_PROMISE = hashPassword('cityguide-timing-equaliser').catch(() => null);

export async function burnPasswordTime() {
  const dummy = await DUMMY_HASH_PROMISE;
  if (dummy) await verifyPassword('cityguide-timing-equaliser', dummy);
}
