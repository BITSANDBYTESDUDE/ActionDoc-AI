import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder. `prefers-reduced-motion` disables the shimmer via
 * globals.css, which leaves a static grey block - still a valid loading state.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer rounded-md bg-muted', className)}
      {...props}
    />
  );
}

function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-9 flex-1', columnIndex === 0 && 'max-w-[40%]')}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export { Skeleton, TableSkeleton };