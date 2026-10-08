/**
 * Authentication service.
 *
 * Passwords are hashed with scrypt (`utils/password.js`) and never stored or
 * logged in plaintext. Sessions are server-side rows: the browser holds a
 * random token in an httpOnly cookie and the database stores only its SHA-256
 * digest, so the cookie cannot be reconstructed from a database dump.
 */
import { config } from '../config/env.js';
import {
  burnPasswordTime,
  hashPassword,
  verifyPassword,
} from '../utils/password.js';
import { generateSessionToken, hashSessionToken, sessionExpiry } from '../utils/tokens.js';
import {
  duplicateResource,
  fromDatabaseError,
  invalidCredentials,
  notFound,
  unauthenticated,
  validationError,
} from '../utils/errors.js';
import { mapUser } from './mappers.js';
import { AuditActions, recordAudit } from './auditService.js';

const USER_COLUMNS = 'id, name, email, role, created_at, updated_at';

async function findUserByEmail(db, email) {
  return db.one(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`,
    [email],
  );
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(db, userId, { userAgent = null, ipAddress = null } = {}) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = sessionExpiry(config.session.ttlHours);

  await db.tx(async (tx) => {
    // Opportunistic housekeeping: drop this user's expired sessions.
    await tx.execute('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?', [
      userId,
      new Date().toISOString(),
    ]);

    await tx.execute(
      `INSERT INTO sessions (token_hash, user_id, user_agent, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        tokenHash,
        userId,
        userAgent ? String(userAgent).slice(0, 400) : null,
        ipAddress,
        expiresAt.toISOString(),
      ],
    );
  });

  return { token, expiresAt };
}

/**
 * Resolves a session cookie to a user.
 *
 * @returns {Promise<{user: object, sessionId: number}|null>} null when the token
 *   is unknown or expired. Expired rows are deleted on discovery.
 */
export async function resolveSession(db, token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const row = await db.one(
    `SELECT s.id   AS session_id,
            s.expires_at,
            u.id, u.name, u.email, u.role, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [tokenHash],
  );

  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await db.execute('DELETE FROM sessions WHERE id = ?', [row.session_id]);
    return null;
  }

  return { user: mapUser(row), sessionId: Number(row.session_id) };
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.execute('DELETE FROM sessions WHERE token_hash = ?', [hashSessionToken(token)]);
}

/** Invalidates every session for a user, optionally sparing the current one. */
export async function destroyAllSessions(db, userId, { exceptSessionId = null } = {}) {
  if (exceptSessionId) {
    await db.execute('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, exceptSessionId]);
    return;
  }
  await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

/**
 * Registers a traveler and opens a session.
 *
 * New accounts always start as `traveler`; elevated roles are granted only
 * through the administrator role-management endpoint.
 */
export async function registerUser(db, input, context = {}) {
  const { userAgent = null, ipAddress = null, logger } = context;

  const existing = await db.one('SELECT id FROM users WHERE email = ?', [input.email]);
  if (existing) {
    throw duplicateResource('An account with that email address already exists.', [
      { field: 'email', message: 'That email address is already registered.' },
    ]);
  }

  const passwordHash = await hashPassword(input.password);

  let created;
  try {
    created = await db.tx(async (tx) => {
      const row = await tx.one(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES (?, ?, ?, 'traveler')
         RETURNING ${USER_COLUMNS}`,
        [input.name, input.email, passwordHash],
      );

      await recordAudit(tx, {
        userId: row.id,
        action: AuditActions.AUTH_REGISTER,
        entityType: 'user',
        entityId: row.id,
        metadata: { email: input.email, role: 'traveler' },
        ipAddress,
        logger,
      });

      return row;
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  const session = await createSession(db, created.id, { userAgent, ipAddress });
  logger?.info({ userId: created.id }, 'User registered');

  return { user: mapUser(created), session };
}

/**
 * Verifies credentials and opens a session.
 *
 * A missing account still performs a dummy hash comparison so response timing
 * does not reveal whether an email address is registered. Both failure modes
 * return the same generic message.
 */
export async function authenticateUser(db, { email, password }, context = {}) {
  const { userAgent = null, ipAddress = null, logger } = context;

  const row = await findUserByEmail(db, email);

  if (!row) {
    await burnPasswordTime();
    await recordAudit(db, {
      userId: null,
      action: AuditActions.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: null,
      metadata: { email, reason: 'unknown_account' },
      ipAddress,
      logger,
    });
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(password, row.password_hash);
  if (!passwordMatches) {
    await recordAudit(db, {
      userId: row.id,
      action: AuditActions.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: row.id,
      metadata: { reason: 'bad_password' },
      ipAddress,
      logger,
    });
    logger?.warn({ userId: row.id, ipAddress }, 'Failed sign-in attempt');
    throw invalidCredentials();
  }

  const session = await createSession(db, row.id, { userAgent, ipAddress });

  await recordAudit(db, {
    userId: row.id,
    action: AuditActions.AUTH_LOGIN,
    entityType: 'user',
    entityId: row.id,
    metadata: { role: row.role },
    ipAddress,
    logger,
  });

  logger?.info({ userId: row.id, role: row.role }, 'User signed in');
  return { user: mapUser(row), session };
}

export async function getUserById(db, id) {
  const row = await db.one(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  if (!row) throw notFound('That account could not be found.');
  return mapUser(row);
}

/** Updates the signed-in user's own name or email address. */
export async function updateOwnProfile(db, userId, patch, context = {}) {
  const { ipAddress = null, logger } = context;

  const existing = await db.one(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
  if (!existing) throw notFound('That account could not be found.');

  if (patch.email && patch.email !== existing.email) {
    const clash = await db.one('SELECT id FROM users WHERE email = ? AND id <> ?', [
      patch.email,
      userId,
    ]);
    if (clash) {
      throw duplicateResource('An account with that email address already exists.', [
        { field: 'email', message: 'That email address is already registered.' },
      ]);
    }
  }

  const nextName = patch.name ?? existing.name;
  const nextEmail = patch.email ?? existing.email;

  try {
    await db.tx(async (tx) => {
      await tx.execute('UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?', [
        nextName,
        nextEmail,
        new Date().toISOString(),
        userId,
      ]);

      await recordAudit(tx, {
        userId,
        action: AuditActions.USER_PROFILE_UPDATE,
        entityType: 'user',
        entityId: userId,
        metadata: {
          nameChanged: nextName !== existing.name,
          emailChanged: nextEmail !== existing.email,
        },
        ipAddress,
        logger,
      });
    });
  } catch (error) {
    if (error?.name === 'AppError') throw error;
    throw fromDatabaseError(error);
  }

  logger?.info({ userId }, 'Profile updated');
  return getUserById(db, userId);
}

/**
 * Changes a password after re-verifying the current one, then invalidates every
 * other session so a stolen cookie cannot outlive the rotation.
 */
export async function changeOwnPassword(
  db,
  userId,
  { currentPassword, newPassword },
  { currentSessionId = null, ipAddress = null, logger } = {},
) {
  const row = await db.one('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
  if (!row) throw notFound('That account could not be found.');

  const matches = await verifyPassword(currentPassword, row.password_hash);
  if (!matches) {
    throw validationError('Your current password is not correct.', [
      { field: 'currentPassword', message: 'That password is not correct.' },
    ]);
  }

  if (await verifyPassword(newPassword, row.password_hash)) {
    throw validationError('Choose a password you have not used before.', [
      { field: 'newPassword', message: 'The new password must differ from the current one.' },
    ]);
  }

  const passwordHash = await hashPassword(newPassword);

  await db.tx(async (tx) => {
    await tx.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      passwordHash,
      new Date().toISOString(),
      userId,
    ]);

    await recordAudit(tx, {
      userId,
      action: AuditActions.AUTH_PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      metadata: null,
      ipAddress,
      logger,
    });
  });

  await destroyAllSessions(db, userId, { exceptSessionId: currentSessionId });
  logger?.info({ userId }, 'Password changed');

  return { changed: true };
}

/** Rejects a request whose session vanished mid-flight. */
export function assertAuthenticated(user) {
  if (!user) throw unauthenticated();
  return user;
}
