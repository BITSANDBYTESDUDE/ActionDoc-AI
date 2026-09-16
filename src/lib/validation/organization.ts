import { z } from 'zod';
import { ROLES } from '@/config/constants';

export const userRoleSchema = z.enum(ROLES);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'An organization name is required.').max(120),
});

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    dueSoonWindowDays: z.number().int().min(1).max(30).optional(),
    notificationsEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const switchOrganizationSchema = z.object({
  organizationId: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid organization id'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Your name is required.').max(120),
  email: z.string().email('A valid email address is required.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  organizationName: z.string().trim().min(2, 'An organization name is required.').max(120),
});

export const loginSchema = z.object({
  email: z.string().email('A valid email address is required.'),
  password: z.string().min(1, 'Your password is required.'),
});