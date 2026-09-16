import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  basePath: string;
  /** Current query parameters, preserved except for `page`. */
  searchParams?: Record<string, string | string[] | undefined>;
}

function buildHref(
  basePath: string,
  searchParams: PaginationProps['searchParams'],
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === 'page' || value === undefined) continue;
    params.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Server-rendered pagination.
 *
 * Renders as plain links so it works without JavaScript and keeps the whole
 * result set out of the client bundle.
 */
export function Pagination({ page, totalPages, total, pageSize, basePath, searchParams }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const linkClass =
    'inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-accent';
  const disabledClass = 'pointer-events-none opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
      </p>

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <Link
            href={buildHref(basePath, searchParams, Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn(linkClass, page <= 1 && disabledClass)}
            tabIndex={page <= 1 ? -1 : undefined}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Previous
          </Link>
          <span className="px-1 text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Link
            href={buildHref(basePath, searchParams, Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={cn(linkClass, page >= totalPages && disabledClass)}
            tabIndex={page >= totalPages ? -1 : undefined}
          >
            Next
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </div>
  );
}