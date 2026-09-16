import { z } from 'zod';
import { objectIdSchema } from '@/lib/validation/common';

export const actionStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const actionPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const actionTypeSchema = z.enum(['TASK', 'DECISION', 'FOLLOW_UP', 'DEADLINE', 'REMINDER']);

export const actionViewSchema = z.enum(['all', 'mine', 'today', 'upcoming', 'overdue', 'completed']);

export const actionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  view: actionViewSchema.default('all'),
  search: z.string().trim().max(200).optional(),
  status: actionStatusSchema.optional(),
  priority: actionPrioritySchema.optional(),
  assigneeId: z.union([objectIdSchema, z.literal('unassigned')]).optional(),
  projectId: objectIdSchema.optional(),
  aiGenerated: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(['createdAt', 'dueDate', 'priority', 'title', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ActionListQuery = z.infer<typeof actionListQuerySchema>;

/** Nullable fields accept an explicit null to clear the value. */
const nullableDate = z.union([z.coerce.date(), z.null()]);
const nullableObjectId = z.union([objectIdSchema, z.null()]);

export const createActionSchema = z.object({
  title: z.string().trim().min(3, 'A title is required.').max(300),
  description: z.string().trim().max(5000).default(''),
  priority: actionPrioritySchema.default('MEDIUM'),
  actionType: actionTypeSchema.default('TASK'),
  assigneeId: nullableObjectId.optional(),
  projectId: nullableObjectId.optional(),
  dueDate: nullableDate.optional(),
});

export const updateActionSchema = z
  .object({
    title: z.string().trim().min(3).max(300).optional(),
    description: z.string().trim().max(5000).optional(),
    priority: actionPrioritySchema.optional(),
    actionType: actionTypeSchema.optional(),
    assigneeId: nullableObjectId.optional(),
    projectId: nullableObjectId.optional(),
    dueDate: nullableDate.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const changeStatusSchema = z.object({
  status: actionStatusSchema,
});

/** Editable fields of a pending AI suggestion, before approval. */
export const editSuggestionSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  assigneeId: nullableObjectId.optional(),
  dueDate: nullableDate.optional(),
  priority: actionPrioritySchema.optional(),
});

export const rejectSuggestionSchema = z.object({
  rejectionReason: z.string().trim().max(500).optional(),
});

export const approveSuggestionSchema = z.object({
  projectId: nullableObjectId.optional(),
});

export const actionIdParamSchema = z.object({ id: objectIdSchema });

/**
 * Bulk operation payload.
 *
 * The operation discriminator decides which field is required, so the shape is
 * validated with a discriminated union rather than a bag of optionals - a
 * `status` request without a status is rejected instead of silently doing
 * nothing. The id cap bounds the work a single request can enqueue.
 */
export const bulkActionSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('status'),
    actionIds: z.array(objectIdSchema).min(1).max(100),
    status: actionStatusSchema,
  }),
  z.object({
    operation: z.literal('assign'),
    actionIds: z.array(objectIdSchema).min(1).max(100),
    assigneeId: nullableObjectId,
  }),
  z.object({
    operation: z.literal('priority'),
    actionIds: z.array(objectIdSchema).min(1).max(100),
    priority: actionPrioritySchema,
  }),
  z.object({
    operation: z.literal('delete'),
    actionIds: z.array(objectIdSchema).min(1).max(100),
  }),
]);

export type BulkActionInput = z.infer<typeof bulkActionSchema>;