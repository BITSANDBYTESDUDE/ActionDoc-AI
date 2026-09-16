import Link from 'next/link';
import { CalendarDays, ListChecks } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getCalendarActions, getCalendarDayCounts } from '@/services/dashboard.service';
import { listMembers } from '@/services/organization.service';
import { listProjectOptions } from '@/services/project.service';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarFilters } from '@/components/actions/calendar-filters';
import { CalendarMonth } from '@/components/actions/calendar-month';
import { ActionStatusBadge, OverdueBadge, PriorityBadge } from '@/components/shared/status-badges';
import { formatDate, toDateKey } from '@/lib/utils/format';
import { currentDate, currentTimeMs } from '@/lib/utils/clock';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Calendar' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Parse `?month=YYYY-MM`, falling back to the current month. */
function resolveMonth(value: string | string[] | undefined): { year: number; month: number } {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split('-').map(Number);
    if (year && month && month >= 1 && month <= 12) return { year, month };
  }
  const now = currentDate();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthBounds(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  // The grid spans whole weeks, so widen slightly to fill leading/trailing cells.
  const gridFrom = new Date(from);
  gridFrom.setUTCDate(gridFrom.getUTCDate() - 7);
  const gridTo = new Date(to);
  gridTo.setUTCDate(gridTo.getUTCDate() + 7);
  return { from, to, gridFrom, gridTo };
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const raw = await searchParams;

  const { year, month } = resolveMonth(raw.month);
  const { from, to, gridFrom, gridTo } = monthBounds(year, month);

  const assigneeId = typeof raw.assignee === 'string' && /^[a-f\d]{24}$/i.test(raw.assignee) ? raw.assignee : undefined;
  const projectId = typeof raw.project === 'string' && /^[a-f\d]{24}$/i.test(raw.project) ? raw.project : undefined;

  const [actions, dayCounts, members, projects] = await Promise.all([
    getCalendarActions({
      organizationId: context.organizationId,
      from,
      to,
      assigneeId,
      projectId,
    }),
    getCalendarDayCounts({ organizationId: context.organizationId, from: gridFrom, to: gridTo }),
    listMembers(context.organizationId),
    listProjectOptions(context.organizationId),
  ]);

  const byDay = new Map<string, typeof actions>();
  for (const action of actions) {
    if (!action.dueDate) continue;
    const key = toDateKey(action.dueDate);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(action);
    else byDay.set(key, [action]);
  }

  // Reading the clock once keeps every due-date comparison in this render
  // consistent, and avoids impure calls scattered through the JSX.
  const now = currentTimeMs();

  const openActions = actions.filter(
    (action) => action.status !== 'COMPLETED' && action.status !== 'CANCELLED',
  );
  const upcoming = openActions.filter((action) => action.dueDate && action.dueDate.getTime() >= now);
  const overdue = openActions.filter((action) => action.dueDate && action.dueDate.getTime() < now);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Calendar"
        description="Every open action with a due date. Click an entry to open the action."
        actions={
          <Button asChild variant="outline">
            <Link href="/actions?view=upcoming">
              <ListChecks aria-hidden="true" />
              Upcoming list
            </Link>
          </Button>
        }
      />

      <CalendarFilters
        year={year}
        month={month}
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        projects={projects}
        currentAssignee={assigneeId ?? ''}
        currentProject={projectId ?? ''}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {monthLabel}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {actions.length} action{actions.length === 1 ? '' : 's'} due this month
          </span>
        </CardHeader>
        <CardContent>
          <CalendarMonth year={year} month={month} byDay={byDay} dayCounts={dayCounts} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Later this month</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No remaining due dates in {monthLabel}. Overdue items stay visible on the grid.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 10).map((action) => (
                  <li key={action.id}>
                    <Link
                      href={`/actions/${action.id}`}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{action.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {action.assigneeName ?? 'Unassigned'} · {formatDate(action.dueDate)}
                        </span>
                      </span>
                      <PriorityBadge priority={action.priority} />
                      <ActionStatusBadge status={action.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing overdue in this month.</p>
            ) : (
              <ul className="divide-y divide-border">
                {overdue
                  .slice(0, 10)
                  .map((action) => (
                    <li key={action.id}>
                      <Link
                        href={`/actions/${action.id}`}
                        className={cn('flex items-center gap-3 py-2.5 transition-colors hover:text-primary')}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{action.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {action.assigneeName ?? 'Unassigned'} · due {formatDate(action.dueDate)}
                          </span>
                        </span>
                        <OverdueBadge />
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {actions.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Nothing on the calendar this month"
          description="Actions appear here once they have a due date. Approve a suggestion with a deadline, or set a due date on an existing action."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/actions">Go to actions</Link>
            </Button>
          }
        />
      ) : null}
    </div>
  );
}