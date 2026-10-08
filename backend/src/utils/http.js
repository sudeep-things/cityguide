/**
 * Small helpers shared by controllers.
 */

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * middleware instead of becoming an unhandled rejection.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} handler
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Reads and clamps pagination parameters from a validated query object.
 * Returns the SQL-ready values plus the metadata echoed back to the client.
 */
export function resolvePagination({ page = 1, limit }, { defaultLimit, maxLimit }) {
  const safeLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), maxLimit);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  return {
    limit: safeLimit,
    offset,
    page: safePage,
    buildMeta(total) {
      const totalItems = Number(total) || 0;
      const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safeLimit);
      return {
        page: safePage,
        limit: safeLimit,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      };
    },
  };
}

/**
 * Builds the `SET` clause for a partial update, ignoring undefined values and
 * always appending `updated_at`. Returns null when nothing would change.
 *
 * @param {Record<string, unknown>} patch
 * @param {Record<string, string>} columnMap camelCase key -> snake_case column
 */
export function buildUpdateSet(patch, columnMap) {
  const assignments = [];
  const values = [];

  for (const [key, column] of Object.entries(columnMap)) {
    if (patch[key] !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(patch[key]);
    }
  }

  if (assignments.length === 0) return null;

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());

  return { clause: assignments.join(', '), values };
}

/** Truncates a value for safe inclusion in a log line. */
export function truncateForLog(value, max = 120) {
  if (value === null || value === undefined) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Success envelope. Every 2xx response from this API has the shape
 * `{ success: true, data: ... }`, mirroring the error envelope.
 */
export function sendOk(res, data = null, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendCreated(res, data = null) {
  return sendOk(res, data, 201);
}

export function sendNoContent(res) {
  return res.status(204).end();
}
