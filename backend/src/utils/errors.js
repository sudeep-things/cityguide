/**
 * Typed application errors.
 *
 * Every failure that reaches a client goes through `AppError`, which carries a
 * stable machine-readable `code`, the HTTP status to use, and an optional
 * `details` array for field-level validation feedback. Anything that is *not*
 * an AppError is treated as an unexpected fault: logged in full server-side,
 * reported to the client as a generic 500 with no stack trace.
 */

/** Stable error codes shared with the frontend. */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  GEOCODING_FAILED: 'GEOCODING_FAILED',
  GEOCODING_NO_RESULTS: 'GEOCODING_NO_RESULTS',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export class AppError extends Error {
  /**
   * @param {number} status  HTTP status code to send.
   * @param {string} code    Stable error code from `ErrorCodes`.
   * @param {string} message Human-readable, safe to show to an end user.
   * @param {object} [options]
   * @param {Array<{field?: string, message: string}>} [options.details]
   * @param {unknown} [options.cause]
   * @param {boolean} [options.expected] Marks handled conditions so the logger
   *   can record them at `warn` instead of `error`.
   */
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expected = options.expected ?? status < 500;
    if (options.cause !== undefined) this.cause = options.cause;
    Error.captureStackTrace?.(this, AppError);
  }

  toResponse() {
    const error = { code: this.code, message: this.message };
    if (this.details?.length) error.details = this.details;
    return { success: false, error };
  }
}

export const badRequest = (message, details) =>
  new AppError(400, ErrorCodes.BAD_REQUEST, message, { details });

export const validationError = (message, details) =>
  new AppError(422, ErrorCodes.VALIDATION_ERROR, message, { details });

export const unauthenticated = (message = 'You must be signed in to do that.') =>
  new AppError(401, ErrorCodes.UNAUTHENTICATED, message);

export const invalidCredentials = (message = 'That email and password combination is not correct.') =>
  new AppError(401, ErrorCodes.INVALID_CREDENTIALS, message);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, ErrorCodes.FORBIDDEN, message);

export const notFound = (message = 'That resource could not be found.') =>
  new AppError(404, ErrorCodes.NOT_FOUND, message);

export const conflict = (message, details) =>
  new AppError(409, ErrorCodes.CONFLICT, message, { details });

export const duplicateResource = (message, details) =>
  new AppError(409, ErrorCodes.DUPLICATE_RESOURCE, message, { details });

export const rateLimited = (message = 'Too many requests. Please slow down and try again shortly.') =>
  new AppError(429, ErrorCodes.RATE_LIMITED, message);

export const internal = (message = 'Something went wrong on our side. Please try again.', cause) =>
  new AppError(500, ErrorCodes.INTERNAL_ERROR, message, { cause, expected: false });

export const upstreamError = (message, cause) =>
  new AppError(502, ErrorCodes.UPSTREAM_ERROR, message, { cause, expected: true });

export const upstreamUnavailable = (message, cause) =>
  new AppError(503, ErrorCodes.UPSTREAM_UNAVAILABLE, message, { cause, expected: true });

/**
 * Translates a raw database driver error into an AppError. Constraint
 * violations are mapped to meaningful 409s rather than leaking SQL text.
 */
export function fromDatabaseError(error) {
  const message = String(error?.message ?? '');
  const code = error?.code ?? '';

  // SQLite: SQLITE_CONSTRAINT_UNIQUE / _FOREIGNKEY / _CHECK
  if (message.includes('UNIQUE constraint failed') || code === '23505') {
    if (/saved_places/i.test(message)) {
      return duplicateResource('That attraction is already in your saved places.');
    }
    if (/itinerary_items/i.test(message) && /position/i.test(message)) {
      return conflict('Those itinerary positions are already in use. Please reload and try again.');
    }
    if (/itinerary_items/i.test(message)) {
      return duplicateResource('That attraction is already part of this itinerary.');
    }
    if (/users/i.test(message) && /email/i.test(message)) {
      return duplicateResource('An account with that email address already exists.');
    }
    if (/categories/i.test(message) && /name/i.test(message)) {
      return duplicateResource('A category with that name already exists.');
    }
    if (/categories/i.test(message) && /slug/i.test(message)) {
      return duplicateResource('A category with that slug already exists.');
    }
    return duplicateResource('That record already exists.');
  }

  // SQLite: SQLITE_CONSTRAINT_FOREIGNKEY | Postgres: 23503
  if (message.includes('FOREIGN KEY constraint failed') || code === '23503') {
    if (/category/i.test(message)) {
      return validationError('The selected category does not exist.', [
        { field: 'categoryId', message: 'Select an existing category.' },
      ]);
    }
    return conflict('That action would break a required relationship between records.');
  }

  // SQLite: SQLITE_CONSTRAINT_CHECK | Postgres: 23514
  if (message.includes('CHECK constraint failed') || code === '23514') {
    if (/latitude|longitude/i.test(message)) {
      return validationError('Those coordinates are outside the valid range.', [
        { field: 'latitude', message: 'Latitude must be between -90 and 90.' },
        { field: 'longitude', message: 'Longitude must be between -180 and 180.' },
      ]);
    }
    return validationError('That value is not allowed.', undefined);
  }

  if (/SQLITE_BUSY|database is locked/i.test(message)) {
    return new AppError(503, ErrorCodes.DATABASE_ERROR, 'The database is busy. Please try again.', {
      cause: error,
    });
  }

  return new AppError(
    500,
    ErrorCodes.DATABASE_ERROR,
    'A database error prevented that action from completing.',
    { cause: error, expected: false },
  );
}
