/**
 * Request logging and correlation ids.
 *
 * Every response carries an `x-request-id`; the same id appears on every log
 * line for that request, so a user-reported failure can be traced back through
 * the server logs. Credentials are redacted by the logger configuration in
 * `config/logger.js`.
 */
import pinoHttp from 'pino-http';
import { logger as rootLogger } from '../config/logger.js';
import { generateRequestId } from '../utils/tokens.js';

export const requestLogger = pinoHttp({
  logger: rootLogger,
  genReqId(req, res) {
    const inbound = req.headers['x-request-id'];
    const id =
      typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 100
        ? inbound
        : generateRequestId();

    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel(req, res, error) {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.originalUrl} responded ${res.statusCode}`;
  },
  customErrorMessage(req, res, error) {
    return `${req.method} ${req.originalUrl} failed: ${error?.message ?? 'unknown error'}`;
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
  // Health checks would otherwise dominate the log at high frequency.
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
});
