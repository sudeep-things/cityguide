/**
 * Error handling.
 *
 * Guarantees:
 *   * every failure leaves the API as the same JSON envelope;
 *   * expected errors are logged at `warn`, unexpected faults at `error` with
 *     the full stack kept server-side;
 *   * stack traces, SQL text and driver messages are never sent to a client.
 */
import { AppError, ErrorCodes, notFound } from '../utils/errors.js';
import { config } from '../config/env.js';

/** Terminal 404 for unmatched `/api` routes. */
export function apiNotFoundHandler(req, res, next) {
  next(notFound(`No API route matches ${req.method} ${req.originalUrl}.`));
}

function normalise(error) {
  if (error instanceof AppError) return error;

  // express.json() rejections arrive as body-parser errors.
  if (error?.type === 'entity.parse.failed') {
    return new AppError(400, ErrorCodes.BAD_REQUEST, 'The request body is not valid JSON.');
  }
  if (error?.type === 'entity.too.large') {
    return new AppError(
      413,
      ErrorCodes.PAYLOAD_TOO_LARGE,
      'That request was too large. Please reduce the size of the data and try again.',
    );
  }
  if (error?.code === 'EBADCSRFTOKEN') {
    return new AppError(403, ErrorCodes.FORBIDDEN, 'That request could not be verified.');
  }

  return new AppError(
    500,
    ErrorCodes.INTERNAL_ERROR,
    'Something went wrong on our side. Please try again.',
    { cause: error, expected: false },
  );
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(error, req, res, next) {
  const appError = normalise(error);
  const log = req.log ?? console;

  const context = {
    err: error,
    status: appError.status,
    code: appError.code,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id ?? null,
  };

  if (appError.status >= 500) {
    log.error(context, 'Unhandled request failure');
  } else if (appError.status === 401 || appError.status === 403) {
    log.warn(context, 'Request rejected by authorization');
  } else {
    log.warn(context, 'Request rejected');
  }

  if (res.headersSent) {
    return next(error);
  }

  const payload = appError.toResponse();
  payload.error.requestId = req.id ?? null;
  payload.error.details = appError.details;

  // Include the stack only in local development, never in production.
  if (!config.isProduction && appError.status >= 500 && error?.stack) {
    payload.error.debug = { message: error.message, stack: error.stack.split('\n').slice(0, 6) };
  }

  return res.status(appError.status).json(payload);
}
