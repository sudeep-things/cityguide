/**
 * Reusable validation primitives.
 *
 * Every rule here is enforced server-side. The frontend mirrors the same
 * constraints for a better experience, but the API never trusts it.
 *
 * Important convention used throughout: an **absent** optional field parses to
 * `undefined` ("leave unchanged") while an **explicit null or blank** parses to
 * `null` ("clear this value"). Conflating the two would let a PATCH that omits
 * coordinates silently erase them.
 */
import { z } from 'zod';

/** Route parameter `:id` — always a positive integer. */
export const idParam = z.coerce
  .number({ error: 'A numeric identifier is required.' })
  .int('Identifiers must be whole numbers.')
  .positive('Identifiers must be positive.');

export const idParamsSchema = z.object({ id: idParam });

/**
 * Email addresses are trimmed and lowercased before validation so that
 * `Ada@Example.com` and `ada@example.com` cannot both register.
 */
export const emailSchema = z
  .string({ error: 'An email address is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }))
  .pipe(z.string().max(254, 'Email addresses cannot exceed 254 characters.'));

/**
 * Length is the meaningful control here: scrypt does the work, and an upper
 * bound avoids hashing megabyte payloads. A mix of character classes is
 * required so that trivially guessable passwords are rejected early.
 */
export const passwordSchema = z
  .string({ error: 'A password is required.' })
  .min(8, 'Passwords must be at least 8 characters long.')
  .max(128, 'Passwords cannot exceed 128 characters.')
  .refine((value) => /[A-Za-z]/.test(value), 'Passwords must contain at least one letter.')
  .refine((value) => /[0-9]/.test(value), 'Passwords must contain at least one number.');

export const nameSchema = z
  .string({ error: 'A name is required.' })
  .trim()
  .min(2, 'Names must be at least 2 characters long.')
  .max(120, 'Names cannot exceed 120 characters.');

/** Free-text description with a sensible upper bound. */
export const descriptionSchema = (min, max) =>
  z
    .string({ error: 'A description is required.' })
    .trim()
    .min(min, `Descriptions must be at least ${min} characters long.`)
    .max(max, `Descriptions cannot exceed ${max} characters.`);

export const addressSchema = z
  .string({ error: 'An address is required.' })
  .trim()
  .min(5, 'Addresses must be at least 5 characters long.')
  .max(300, 'Addresses cannot exceed 300 characters.');

/** True when at least one key carries a concrete (non-undefined) value. */
export function hasAnyDefined(value) {
  return Object.values(value).some((item) => item !== undefined);
}

/**
 * Optional free text: absent stays absent, blank becomes null, and over-long
 * input is rejected with a field-specific message.
 */
export function optionalTextSchema({ max = 500, label = 'Value' } = {}) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      if (value === null) return null;

      const text = String(value).trim();
      if (text === '') return null;
      if (text.length > max) {
        ctx.addIssue({ code: 'custom', message: `${label} cannot exceed ${max} characters.` });
        return z.NEVER;
      }
      return text;
    });
}

/**
 * Latitude/longitude accept numbers or numeric strings (HTML inputs submit
 * strings), an explicit null meaning "clear it", and absence meaning "leave
 * unchanged".
 */
function coordinateSchema(label, min, max) {
  return z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      if (value === null || String(value).trim() === '') return null;

      const parsed = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number.` });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be between ${min} and ${max}.` });
        return z.NEVER;
      }
      // ~11 cm of precision, matching what Nominatim returns.
      return Math.round(parsed * 1e6) / 1e6;
    });
}

export const latitudeSchema = coordinateSchema('Latitude', -90, 90);
export const longitudeSchema = coordinateSchema('Longitude', -180, 180);

/** Optional http(s) URL. Rejects `javascript:` and other dangerous schemes. */
export const imageUrlSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || String(value).trim() === '') return null;

    const text = String(value).trim();
    if (text.length > 2048) {
      ctx.addIssue({ code: 'custom', message: 'Image URLs cannot exceed 2048 characters.' });
      return z.NEVER;
    }

    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid image URL.' });
      return z.NEVER;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Image URLs must start with http:// or https://.' });
      return z.NEVER;
    }

    return parsed.toString();
  });

/** Pagination shared by list endpoints that take no other filters. */
export const paginationSchema = z.object({
  page: z.coerce
    .number({ error: 'Page must be a number.' })
    .int('Page must be a whole number.')
    .min(1, 'Page must be at least 1.')
    .default(1),
  limit: z.coerce
    .number({ error: 'Limit must be a number.' })
    .int('Limit must be a whole number.')
    .min(1, 'Limit must be at least 1.')
    .max(100, 'Limit cannot exceed 100.')
    .default(12),
});

/** Boolean flag arriving as a query string. */
export const booleanQuerySchema = z
  .enum(['true', 'false'], { error: 'Expected "true" or "false".' })
  .transform((value) => value === 'true');

/**
 * Formats Zod issues into the `details` array used by the API error envelope.
 * Field paths are joined so nested keys read naturally (`items.0.position`).
 */
export function formatIssues(error) {
  return error.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : undefined;
    return field ? { field, message: issue.message } : { message: issue.message };
  });
}
