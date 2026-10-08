/**
 * Itinerary, saved-place and geocoding validation.
 */
import { z } from 'zod';
import { addressSchema, hasAnyDefined, idParam, optionalTextSchema } from './common.js';

const itineraryNameSchema = z
  .string({ error: 'An itinerary name is required.' })
  .trim()
  .min(2, 'Itinerary names must be at least 2 characters long.')
  .max(120, 'Itinerary names cannot exceed 120 characters.');

export const itineraryCreateSchema = z.object({
  name: itineraryNameSchema,
  description: optionalTextSchema({ max: 1000, label: 'Itinerary descriptions' }),
});

export const itineraryUpdateSchema = z
  .object({
    name: itineraryNameSchema.optional(),
    description: optionalTextSchema({ max: 1000, label: 'Itinerary descriptions' }),
  })
  .refine(hasAnyDefined, { message: 'Provide at least one field to update.' });

export const itineraryItemCreateSchema = z.object({
  attractionId: idParam,
  /** Optional insertion index; appended to the end when omitted. */
  position: z.coerce.number().int().min(0).optional(),
});

/**
 * Reordering accepts the complete set of item ids in their new order. Sending
 * the whole list (rather than a from/to pair) makes the operation idempotent
 * and impossible to half-apply.
 */
export const itineraryReorderSchema = z.object({
  itemIds: z
    .array(idParam, { error: 'itemIds must be an array of itinerary item identifiers.' })
    .min(1, 'Provide at least one itinerary item.')
    .max(200, 'An itinerary cannot contain more than 200 items.')
    .refine((ids) => new Set(ids).size === ids.length, 'Item identifiers must be unique.'),
});

export const savedPlaceCreateSchema = z.object({
  attractionId: idParam,
});

/** A single address string to forward to Nominatim, user-triggered. */
export const geocodeRequestSchema = z.object({
  address: addressSchema,
});

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  userId: idParam.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
