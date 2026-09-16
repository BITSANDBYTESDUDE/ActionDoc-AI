import { z } from 'zod';
import { objectIdSchema } from '@/lib/validation/common';

export const projectStatusSchema = z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: projectStatusSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
  sort: z.enum(['createdAt', 'name', 'endDate', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'A project name is required.').max(200),
  description: z.string().trim().max(5000).default(''),
  status: projectStatusSchema.default('PLANNING'),
  ownerId: objectIdSchema.optional(),
  startDate: z.union([z.coerce.date(), z.null()]).optional(),
  endDate: z.union([z.coerce.date(), z.null()]).optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    status: projectStatusSchema.optional(),
    ownerId: objectIdSchema.optional(),
    startDate: z.union([z.coerce.date(), z.null()]).optional(),
    endDate: z.union([z.coerce.date(), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const projectIdParamSchema = z.object({ id: objectIdSchema });

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;