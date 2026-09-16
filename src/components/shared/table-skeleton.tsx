import { Skeleton } from '@/components/ui/skeleton';

/** Table-shaped loading skeleton used by the list pages. */
export function TableLoadingSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className="h-5 flex-1"
              style={{ maxWidth: columnIndex === 0 ? '40%' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}