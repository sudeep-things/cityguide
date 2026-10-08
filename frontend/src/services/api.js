/**
 * API client.
 *
 * One place that knows how to talk to the backend:
 *   * sends the session cookie (`credentials: 'include'`);
 *   * unwraps the `{ success, data }` envelope and throws `ApiError` for
 *     `{ success: false, error }`;
 *   * converts network failures into a friendly, typed error.
 *
 * Components therefore never see raw fetch responses or backend internals.
 */

/**
 * Base path for the API. Locally this stays relative so Vite's dev proxy
 * forwards `/api` to Express (no CORS, no cookies to configure). In production
 * set `VITE_API_URL` to the deployed API origin, including `/api`.
 */
const RAW_BASE = import.meta.env.VITE_API_URL ?? '/api';
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

/** Error codes the UI has special handling for. */
export const ApiErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  RATE_LIMITED: 'RATE_LIMITED',
  GEOCODING_NO_RESULTS: 'GEOCODING_NO_RESULTS',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
};

export class ApiError extends Error {
  constructor({ status, code, message, details = [], requestId = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
    this.requestId = requestId;
  }

  /** True when the failure means "you are not signed in". */
  get isUnauthenticated() {
    return this.status === 401;
  }

  /** True when the failure means "you are signed in, but not allowed". */
  get isForbidden() {
    return this.status === 403;
  }

  get isNetworkError() {
    return this.code === ApiErrorCodes.NETWORK_ERROR;
  }

  /** Field-keyed validation messages, for inline form errors. */
  get fieldErrors() {
    const map = {};
    for (const detail of this.details) {
      if (detail?.field && !map[detail.field]) map[detail.field] = detail.message;
    }
    return map;
  }
}

/** Builds a query string, skipping empty values. */
export function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Performs a request and unwraps the response envelope.
 *
 * @param {string} path    Path beginning with `/`, e.g. `/attractions`.
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {unknown} [options.body]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>} The `data` payload.
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Re-throw aborts so React Query can ignore cancelled requests.
    if (error?.name === 'AbortError') throw error;

    throw new ApiError({
      status: 0,
      code: ApiErrorCodes.NETWORK_ERROR,
      message: 'Unable to reach the server. Check your connection and try again.',
    });
  }

  const payload = await parseBody(response);

  if (response.ok && payload?.success !== false) {
    return payload?.data ?? null;
  }

  const error = payload?.error;

  throw new ApiError({
    status: response.status,
    code: error?.code ?? 'INTERNAL_ERROR',
    message:
      error?.message ??
      (response.ok
        ? 'The server returned an unexpected response.'
        : `Request failed with status ${response.status}.`),
    details: error?.details ?? [],
    requestId: error?.requestId ?? null,
  });
}

/** Convenience wrappers. */
export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
};
