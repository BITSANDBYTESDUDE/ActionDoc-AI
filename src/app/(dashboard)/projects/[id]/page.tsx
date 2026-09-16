import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getProjectDetail, listActionsForProject } from '@/services/project.service';
import { AppError } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ActionStatusBadge, OverdueBadge, PriorityBadge, ProjectStatusBadge } from '@/components/shared/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TaskProgress } from '@/components/projects/task-progress';
import { ProjectActions } from '@/components/projects/project-actions';
import { formatDate } from '@/lib/utils/format';
import { currentTimeMs } from '@/lib/utils/clock';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ id: string }>;

export default async function ProjectDetailPage({ params }: { params: PageParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  let project;
  try {
    project = await getProjectDetail({ organizationId: context.organizationId, projectId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const actions = await listActionsForProject({
    organizationId: context.organizationId,
    projectId: id,
    limit: 200,
  });

  const canManage = context.role === 'OWNER' || context.role === 'ADMIN';

  // One clock reading per render keeps every overdue badge consistent.
  const nowMs = currentTimeMs();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/projects">
            <ArrowLeft aria-hidden="true" />
            Projects
          </Link>
        </Button>

        <PageHeader
          title={project.name}
          description={project.description || undefined}
          actions={
            <>
              <ProjectStatusBadge status={project.status} />
              {canManage ? <ProjectActions projectId={project.id} status={project.status} /> : null}
            </>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListChecks className="size-4" aria-hidden="true" />
                Actions in this project ({actions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <EmptyState
                  icon={<ListChecks />}
                  title="No actions in this project"
                  description="Approve an AI suggestion and choose this project, or assign an existing action to it."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/actions">Go to actions</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {actions.map((action) => {
                    const due = action.dueDate ? new Date(action.dueDate) : null;
                    const overdue = Boolean(
                      due &&
                        action.status !== 'COMPLETED' &&
                        action.status !== 'CANCELLED' &&
                        due.getTime() < nowMs,
                    );
                    const assignee = action.assigneeId as { name?: string } | null;

                    return (
                      <li key={String(action._id)}>
                        <Link
                          href={`/actions/${String(action._id)}`}
                          className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{action.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {assignee?.name ?? 'Unassigned'} ·{' '}
                              {due ? `due ${formatDate(due)}` : 'No due date'}
                            </span>
                          </span>
                          {overdue ? <OverdueBadge /> : null}
                          <PriorityBadge priority={action.priority} />
                          <ActionStatusBadge status={action.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskProgress counts={project.actionCounts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Owner</span>
                <span className="font-medium">{project.ownerName ?? 'Unassigned'}</span>
              </div>
              <Separator />
              <dl className="space-y-2">
                <Row label="Status" value={project.status.toLowerCase()} />
                <Row label="Start" value={project.startDate ? formatDate(project.startDate) : 'Not set'} />
                <Row label="End" value={project.endDate ? formatDate(project.endDate) : 'Not set'} />
                <Row label="Created" value={formatDate(project.createdAt)} />
                <Row label="Archived" value={project.archivedAt ? formatDate(project.archivedAt) : 'No'} />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}
