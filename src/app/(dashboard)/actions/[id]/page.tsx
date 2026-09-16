import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getActionDetail } from '@/services/action.service';
import { listMembers } from '@/services/organization.service';
import { listProjectOptions } from '@/services/project.service';
import { AppError } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { ActionStatusBadge, AiBadge, PriorityBadge } from '@/components/shared/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatDateTime, formatDueDate } from '@/lib/utils/format';
import { ActionDetailPanel } from '@/components/actions/action-detail-panel';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ id: string }>;

export default async function ActionDetailPage({ params }: { params: PageParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;

  let action;
  try {
    action = await getActionDetail({ organizationId: context.organizationId, actionId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const [members, projects] = await Promise.all([
    listMembers(context.organizationId),
    listProjectOptions(context.organizationId),
  ]);

  const canDelete = context.role === 'OWNER' || context.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/actions">
            <ArrowLeft aria-hidden="true" />
            Actions
          </Link>
        </Button>

        <PageHeader
          title={action.title}
          description={action.projectName ? `Project: ${action.projectName}` : undefined}
          actions={
            <div className="flex items-center gap-2">
              {action.aiGenerated ? <AiBadge confidence={action.aiConfidence} /> : null}
              <ActionStatusBadge status={action.status} />
              <PriorityBadge priority={action.priority} />
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {action.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{action.description}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No description was provided.</p>
              )}
            </CardContent>
          </Card>

          {action.evidence ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  Evidence from the source document
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic leading-relaxed text-muted-foreground">
                  “{action.evidence}”
                </blockquote>
                {action.sourceLocation ? (
                  <p className="text-xs text-muted-foreground">Location: {action.sourceLocation}</p>
                ) : null}
                <Separator />
                <dl className="grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Origin</dt>
                    <dd className="font-medium">Approved AI suggestion</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI confidence</dt>
                    <dd className="font-medium">
                      {action.aiConfidence === null
                        ? 'Not recorded'
                        : `${Math.round(action.aiConfidence * 100)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Source document</dt>
                    <dd className="font-medium">
                      {action.documentId ? (
                        <Link href={`/documents/${action.documentId}`} className="text-primary hover:underline">
                          {action.sourceDocumentName ?? 'Open document'}
                        </Link>
                      ) : (
                        (action.sourceDocumentName ?? 'Deleted document')
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Confidence was a review signal when this suggestion was approved. The decision was
                  made by a person - see the audit log for the reviewer and timestamp.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Record</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <Detail label="Created by" value={action.createdByName ?? 'Unknown'} />
                <Detail label="Created" value={formatDateTime(action.createdAt)} />
                <Detail label="Last updated" value={formatDateTime(action.updatedAt)} />
                <Detail
                  label="Completed"
                  value={action.completedAt ? formatDateTime(action.completedAt) : 'Not completed'}
                />
                <Detail label="Type" value={action.actionType.replace('_', ' ').toLowerCase()} />
                <Detail label="Action id" value={action.id} />
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Work on this action</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionDetailPanel
                action={{
                  id: action.id,
                  title: action.title,
                  description: action.description,
                  status: action.status,
                  priority: action.priority,
                  assigneeId: action.assigneeId,
                  projectId: action.projectId,
                  dueDate: action.dueDate ? action.dueDate.toISOString() : null,
                  completedAt: action.completedAt ? action.completedAt.toISOString() : null,
                  isOverdue: action.isOverdue,
                }}
                members={members.map((member) => ({ id: member.userId, name: member.name }))}
                projects={projects}
                canDelete={canDelete}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Due date</span>
                <span className="font-medium">{formatDueDate(action.dueDate)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Assignee</span>
                <span className="font-medium">{action.assigneeName ?? 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Project</span>
                <span className="font-medium">{action.projectName ?? 'None'}</span>
              </div>
              {action.isOverdue ? (
                <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                  This action is past its due date.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {action.documentId ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="size-4" aria-hidden="true" />
                  Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link href={`/documents/${action.documentId}`}>
                    {action.sourceDocumentName ?? 'Open the source document'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}