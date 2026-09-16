import Link from 'next/link';
import { ListChecks, SearchX, Sparkles } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getActionViewCounts, listActions } from '@/services/action.service';
import { listMembers } from '@/services/organization.service';
import { listProjectOptions } from '@/services/project.service';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ActionStatusBadge, AiBadge, OverdueBadge, PriorityBadge } from '@/components/shared/status-badges';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { ActionFilters } from '@/components/actions/action-filters';
import { ActionQuickCreate } from '@/components/actions/action-quick-create';
import { ActionRowActions } from '@/components/actions/action-row-actions';
import { ActionSelectionProvider } from '@/components/actions/action-selection';
import { ActionBulkToolbar } from '@/components/actions/action-bulk-toolbar';
import {
  ActionSelectAllCheckbox,
  ActionSelectCheckbox,
} from '@/components/actions/action-select-checkbox';
import { formatDueDate } from '@/lib/utils/format';
import { actionListQuerySchema } from '@/lib/validation/action';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Actions' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My actions' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
] as const;

export default async function ActionsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const raw = await searchParams;

  const parsed = actionListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : actionListQuerySchema.parse({});

  const [result, counts, members, projects] = await Promise.all([
    listActions({ organizationId: context.organizationId, userId: context.userId, query }),
    getActionViewCounts({ organizationId: context.organizationId, userId: context.userId }),
    listMembers(context.organizationId),
    listProjectOptions(context.organizationId),
  ]);

  const isFiltered = Boolean(
    query.search ||
      query.status ||
      query.priority ||
      query.assigneeId ||
      query.projectId ||
      query.aiGenerated !== undefined ||
      query.dateFrom ||
      query.dateTo,
  );

  function viewHref(view: string) {
    const params = new URLSearchParams();
    if (view !== 'all') params.set('view', view);
    const search = params.toString();
    return search ? `/actions?${search}` : '/actions';
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Action Center"
        description="Confirmed work. Actions only exist here once a person has approved them."
        actions={<ActionQuickCreate members={members.map((m) => ({ id: m.userId, name: m.name }))} projects={projects} />}
      />

      <nav aria-label="Action views" className="flex flex-wrap gap-1.5">
        {VIEWS.map((view) => {
          const active = query.view === view.key;
          const count = counts[view.key];
          return (
            <Link
              key={view.key}
              href={viewHref(view.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {view.label}
              <span className="tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      <ActionFilters
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        projects={projects}
        current={{
          view: query.view,
          search: query.search ?? '',
          status: query.status ?? '',
          priority: query.priority ?? '',
          assigneeId: query.assigneeId ?? '',
          projectId: query.projectId ?? '',
          aiGenerated: query.aiGenerated === undefined ? '' : String(query.aiGenerated),
          sort: query.sort,
          order: query.order,
        }}
      />

      {result.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={<SearchX />}
            title="No actions match these filters"
            description="Try a different view or clear the filters to see all confirmed work."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/actions">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ListChecks />}
            title={query.view === 'mine' ? 'Nothing assigned to you' : 'No actions yet'}
            description="Approve an AI suggestion on a document, or create an action directly, and it will appear here."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/documents">Go to documents</Link>
              </Button>
            }
          />
        )
      ) : (
        <ActionSelectionProvider>
          <div className="space-y-3">
            <ActionBulkToolbar
              members={members.map((member) => ({ id: member.userId, name: member.name }))}
            />

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Actions in {context.organizationName}, page {result.page} of {result.totalPages}
                  </caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="w-10 px-4 py-2.5 font-medium">
                        <ActionSelectAllCheckbox ids={result.items.map((action) => action.id)} />
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Action
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Priority
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Assignee
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Due
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Project
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((action) => (
                      <tr
                        key={action.id}
                        className={cn(
                          'border-b border-border last:border-0 hover:bg-accent/40',
                          action.isOverdue && 'bg-destructive/[0.03]',
                        )}
                      >
                        <td className="px-4 py-3">
                          <ActionSelectCheckbox actionId={action.id} title={action.title} />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/actions/${action.id}`} className="group block">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium group-hover:text-primary">
                                {action.title}
                              </span>
                              {action.aiGenerated ? <AiBadge confidence={action.aiConfidence} /> : null}
                            </span>
                            {action.sourceDocumentName ? (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                From “{action.sourceDocumentName}”
                              </span>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <ActionStatusBadge status={action.status} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={action.priority} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {action.assigneeName ?? (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="flex items-center gap-1.5">
                            {formatDueDate(action.dueDate)}
                            {action.isOverdue ? <OverdueBadge /> : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {action.projectName ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ActionRowActions
                            action={{
                              id: action.id,
                              title: action.title,
                              status: action.status,
                              priority: action.priority,
                            }}
                            members={members.map((member) => ({ id: member.userId, name: member.name }))}
                            canDelete={context.role === 'OWNER' || context.role === 'ADMIN'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-border px-4 py-3">
                <Pagination
                  page={result.page}
                  totalPages={result.totalPages}
                  total={result.total}
                  pageSize={result.pageSize}
                  basePath="/actions"
                  searchParams={raw}
                />
              </div>
            </Card>
          </div>
        </ActionSelectionProvider>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        The AI badge marks actions that originated from an approved AI suggestion.
      </p>
    </div>
  );
}