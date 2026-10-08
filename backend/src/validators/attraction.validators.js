/**
 * Attraction and category validation.
 */
import { z } from 'zod';
import {
  addressSchema,
  descriptionSchema,
  hasAnyDefined,
  idParam,
  imageUrlSchema,
  latitudeSchema,
  longitudeSchema,
  nameSchema,
  optionalTextSchema,
} from './common.js';

/** Accepted sort keys, mapped to SQL in the service layer. */
export const ATTRACTION_SORT_KEYS = [
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'category',
  'recently_updated',
];

export const attractionCreateSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema(10, 4000),
    categoryId: idParam,
    address: addressSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    imageUrl: imageUrlSchema,
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: 'Provide both latitude and longitude, or leave both empty.',
    path: ['latitude'],
  });

/**
 * Partial update. At least one recognised field must be present so that an
 * empty PATCH is rejected rather than treated as "change nothing".
 *
 * Coordinates are treated as a pair: either neither is touched, both are set,
 * or both are explicitly cleared with `null`. Updating just one would leave the
 * attraction at a coordinate that does not exist.
 */
export const attractionUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema(10, 4000).optional(),
    categoryId: idParam.optional(),
    address: addressSchema.optional(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    imageUrl: imageUrlSchema,
  })
  .refine(hasAnyDefined, { message: 'Provide at least one field to update.' })
  .refine(
    (value) => {
      const latitudeTouched = value.latitude !== undefined;
      const longitudeTouched = value.longitude !== undefined;

      if (!latitudeTouched && !longitudeTouched) return true;
      if (latitudeTouched !== longitudeTouched) return false;

      // Both touched: either both cleared, or both given a value.
      return (value.latitude === null) === (value.longitude === null);
    },
    {
      message: 'Latitude and longitude must be updated together.',
      path: ['latitude'],
    },
  );

export const attractionListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Category may be addressed by slug or by numeric id. */
  category: z.string().trim().max(80).optional(),
  categoryId: idParam.optional(),
  sort: z.enum(ATTRACTION_SORT_KEYS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  /** When true, only attractions that already have coordinates. */
  mapped: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const categoryCreateSchema = z.object({
  name: z
    .string({ error: 'A category name is required.' })
    .trim()
    .min(2, 'Category names must be at least 2 characters long.')
    .max(80, 'Category names cannot exceed 80 characters.'),
  description: optionalTextSchema({ max: 500, label: 'Category descriptions' }),
});

export const categoryUpdateSchema = z
  .object({
    name: z
      .string({ error: 'A category name is required.' })
      .trim()
      .min(2, 'Category names must be at least 2 characters long.')
      .max(80, 'Category names cannot exceed 80 characters.')
      .optional(),
    description: optionalTextSchema({ max: 500, label: 'Category descriptions' }),
  })
  .refine(hasAnyDefined, { message: 'Provide at least one field to update.' });
