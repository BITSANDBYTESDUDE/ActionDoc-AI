import { cn } from '@/lib/utils';

/**
 * Progress bar for a project's actions.
 *
 * Counts come from a live aggregation, so this always reflects the real action
 * list rather than a stored counter that can drift.
 */
export function TaskProgress({
  counts,
  showLabels = true,
}: {
  counts: {
    total: number;
    todo: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    overdue: number;
  };
  showLabels?: boolean;
}) {
  const denominator = Math.max(1, counts.total);
  const completedPercent = Math.round((counts.completed / denominator) * 100);
  const inProgressPercent = Math.round((counts.inProgress / denominator) * 100);
  const todoPercent = Math.round((counts.todo / denominator) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {counts.completed} of {counts.total} done
        </span>
        <span className="tabular-nums">{counts.total === 0 ? 0 : completedPercent}%</span>
      </div>

      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${counts.completed} of ${counts.total} actions completed`}
      >
        <span
          className="h-full bg-[var(--color-success)]"
          style={{ width: `${completedPercent}%` }}
        />
        <span className="h-full bg-[var(--color-info)]" style={{ width: `${inProgressPercent}%` }} />
        <span className="h-full bg-[var(--color-border)]" style={{ width: `${todoPercent}%` }} />
      </div>

      {showLabels ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <li>{counts.todo} to do</li>
          <li>{counts.inProgress} in progress</li>
          <li>{counts.completed} completed</li>
          {counts.overdue > 0 ? (
            <li className={cn('font-medium text-destructive')}>{counts.overdue} overdue</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}