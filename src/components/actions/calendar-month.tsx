import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { UpcomingAction } from '@/services/dashboard.service';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month grid rendered on the server.
 *
 * Cells show an aggregate count from a database-side `$group` plus the first
 * few titles, so a busy month never ships hundreds of rows to the browser.
 */
export function CalendarMonth({
  year,
  month,
  byDay,
  dayCounts,
}: {
  year: number;
  month: number;
  byDay: Map<string, UpcomingAction[]>;
  dayCounts: Record<string, number>;
}) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Monday-first grid, matching the WEEKDAYS header.
  const leading = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const todayKey = new Date().toISOString().slice(0, 10);

  const cells = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - leading + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return { dayNumber: null as number | null, key: null as string | null };
    const key = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    return { dayNumber, key };
  });

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          if (!cell.dayNumber || !cell.key) {
            return <div key={`empty-${index}`} className="min-h-24 border-b border-r border-border bg-muted/20" />;
          }

          const items = byDay.get(cell.key) ?? [];
          const count = items.length || dayCounts[cell.key] || 0;
          const isToday = cell.key === todayKey;
          const isPast = cell.key < todayKey;

          return (
            <div
              key={cell.key}
              className={cn(
                'min-h-24 border-b border-r border-border p-1.5 align-top',
                isToday && 'bg-primary/[0.06]',
                !isToday && isPast && count > 0 && 'bg-destructive/[0.03]',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'text-[11px] font-medium tabular-nums',
                    isToday ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {cell.dayNumber}
                </span>
                {count > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {count}
                  </span>
                ) : null}
              </div>

              <ul className="space-y-1">
                {items.slice(0, 3).map((action) => (
                  <li key={action.id}>
                    <Link
                      href={`/actions/${action.id}`}
                      className={cn(
                        'block truncate rounded px-1 py-0.5 text-[10px] leading-snug transition-colors hover:bg-accent',
                        action.status === 'COMPLETED'
                          ? 'text-muted-foreground line-through'
                          : action.priority === 'URGENT'
                            ? 'bg-destructive/10 text-destructive'
                            : action.priority === 'HIGH'
                              ? 'bg-[color-mix(in_oklch,var(--color-warning)_15%,transparent)]'
                              : 'bg-muted',
                      )}
                      title={action.title}
                    >
                      {action.title}
                    </Link>
                  </li>
                ))}
                {items.length > 3 ? (
                  <li className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}