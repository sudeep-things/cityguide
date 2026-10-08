/**
 * Zod request validation.
 *
 * Validated output replaces the raw input in `req.valid`, so controllers work
 * with coerced, trimmed, whitelisted values and never touch raw user input.
 * Unknown keys are stripped by Zod's default object behaviour.
 */
import { formatIssues } from '../validators/common.js';
import { validationError } from '../utils/errors.js';

/**
 * @param {{params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny}} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    req.valid = {};

    try {
      if (schemas.params) req.valid.params = schemas.params.parse(req.params);
      if (schemas.query) req.valid.query = schemas.query.parse(req.query);
      if (schemas.body) req.valid.body = schemas.body.parse(req.body ?? {});
      return next();
    } catch (error) {
      if (error && Array.isArray(error.issues)) {
        return next(validationError('The submitted data is not valid.', formatIssues(error)));
      }
      return next(error);
    }
  };
}
