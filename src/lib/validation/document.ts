import { z } from 'zod';
import { objectIdSchema } from '@/lib/validation/common';

export const documentStatusSchema = z.enum([
  'UPLOADED',
  'PROCESSING',
  'EXTRACTED',
  'ANALYZING',
  'REVIEW',
  'COMPLETED',
  'FAILED',
]);

export const sourceTypeSchema = z.enum(['PDF', 'DOCX', 'TXT', 'MARKDOWN']);

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: documentStatusSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  createdById: objectIdSchema.optional(),
  sort: z.enum(['createdAt', 'displayName', 'fileSize', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const updateDocumentSchema = z.object({
  displayName: z.string().trim().min(1).max(512).optional(),
  summary: z.string().trim().max(4000).optional(),
});

export const documentIdParamSchema = z.object({ id: objectIdSchema });