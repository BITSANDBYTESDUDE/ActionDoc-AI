import { z, ZodError } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character hexadecimal id');

export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

/**
 * Assert and narrow an arbitrary path/param value to an ObjectId string.
 * Throws a ZodError consumed by the API error mapper.
 */
export function assertObjectId(value: unknown, field = 'id'): string {
  if (!isValidObjectId(value)) {
    throw new ZodError([
      {
        code: 'custom',
        path: [field],
        message: 'Must be a valid 24-character hexadecimal id',
      },
    ]);
  }
  return value;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function buildPagination(pagination: Pagination) {
  const { page, pageSize } = pagination;
  return {
    skip: (page - 1) * pageSize,
    limit: pageSize,
    page,
    pageSize,
  };
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}