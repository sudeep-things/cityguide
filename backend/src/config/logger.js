/**
 * Application logger.
 *
 * Structured JSON via pino. Two rules drive the configuration:
 *   1. Never log credentials — cookie headers, authorization headers and
 *      password fields are redacted before a record is written.
 *   2. Always log enough context (request id, user id, route) that an
 *      operator can reconstruct what happened.
 */
import pino from 'pino';
import { config } from './env.js';

/**
 * Field paths scrubbed from every log record. `*.password` style globs cover
 * both request bodies and nested objects.
 */
const redactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'token_hash',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  'DATABASE_URL',
];

export const logger = pino({
  level: config.logging.level,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'cityguide-api', env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Creates a logger bound to a request/actor context. Services receive one of
 * these instead of importing the root logger so that every line carries the
 * correlation id.
 */
export function childLogger(bindings = {}) {
  return logger.child(bindings);
}

export default logger;
