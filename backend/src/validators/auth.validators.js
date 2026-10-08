/**
 * Authentication and profile validation.
 */
import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from './common.js';

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately only a presence check: rejecting a short password at login
  // would reveal which inputs can never be valid.
  password: z.string({ error: 'A password is required.' }).min(1, 'A password is required.'),
});

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Your current password is required.' }).min(1),
  newPassword: passwordSchema,
});

/** Administrator action: change another account's role. */
export const updateUserRoleSchema = z.object({
  role: z.enum(['traveler', 'curator', 'admin'], {
    error: 'Role must be one of traveler, curator or admin.',
  }),
});

export const userListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(['traveler', 'curator', 'admin']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
