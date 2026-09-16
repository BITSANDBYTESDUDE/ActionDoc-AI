import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileStack,
  FileText,
  ListChecks,
  ScanSearch,
  Sparkles,
  Upload,
} from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getDashboardData } from '@/services/dashboard.service';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard, SectionHeader } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActionStatusBadge, DocumentStatusBadge, OverdueBadge, PriorityBadge } from '@/components/shared/status-badges';
import { formatDueDate, formatNumber, formatPercent, formatRelative } from '@/lib/utils/format';
import { UploadDocumentButton } from '@/components/documents/upload-document-button';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const context = await requireOrganizationMembership('VIEWER');

  const data = await getDashboardData({
    organizationId: context.organizationId,
    userId: context.userId,
    recentLimit: 5,
  });

  const { stats } = data;
  const openActions = stats.actions.pending + stats.actions.inProgress;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome back to ${context.organizationName}`}
        description="Documents in, AI suggestions reviewed, work tracked to completion."
        actions={
          <>
            <UploadDocumentButton />
            <Button asChild variant="outline">
              <Link href="/actions">
                <ListChecks aria-hidden="true" />
                View actions
              </Link>
            </Button>
          </>
        }
      />

      {/* Pipeline summary: documents -> AI review -> actions */}
      <section aria-label="Overview">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Documents"
            value={formatNumber(stats.documents.total)}
            hint={`${stats.documents.processing} in processing`}
            icon={<FileText />}
            href="/documents"
          />
          <StatCard
            label="Needs review"
            value={formatNumber(stats.documents.review)}
            hint="Documents with suggestions to approve"
            icon={<ScanSearch />}
            tone={stats.documents.review > 0 ? 'warning' : 'default'}
            href="/documents?status=REVIEW"
          />
          <StatCard
            label="Open actions"
            value={formatNumber(openActions)}
            hint={`${stats.actions.inProgress} in progress · ${stats.actions.pending} to do`}
            icon={<ListChecks />}
            href="/actions"
          />
          <StatCard
            label="Overdue"
            value={formatNumber(stats.actions.overdue)}
            hint={stats.actions.overdue > 0 ? 'Requires attention' : 'Nothing overdue'}
            icon={<AlertTriangle />}
            tone={stats.actions.overdue > 0 ? 'destructive' : 'default'}
            href="/actions?view=overdue"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="recent-documents">
            <SectionHeader
              title="Recent documents"
              description="Latest uploads and their processing state"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/documents">View all</Link>
                </Button>
              }
            />
            <h2 id="recent-documents" className="sr-only">
              Recent documents
            </h2>

            {data.recentDocuments.length === 0 ? (
              <EmptyState
                icon={<FileStack />}
                title="No documents yet"
                description="Upload meeting notes, a project specification or a client brief. ActionDoc AI will read it and propose the actions it finds inside."
                action={<UploadDocumentButton label="Upload your first document" />}
              />
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {data.recentDocuments.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                          {doc.sourceType}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{doc.displayName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatRelative(doc.createdAt)}
                            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
                            {doc.wordCount ? ` · ${formatNumber(doc.wordCount)} words` : ''}
                          </span>
                        </span>
                        <DocumentStatusBadge status={doc.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <section aria-labelledby="upcoming-actions">
            <SectionHeader
              title="Upcoming actions"
              description="Open work with a due date, soonest first"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/actions?view=upcoming">View all</Link>
                </Button>
              }
            />
            <h2 id="upcoming-actions" className="sr-only">
              Upcoming actions
            </h2>

            {data.upcomingActions.length === 0 ? (
              <EmptyState
                icon={<ListChecks />}
                title="Nothing scheduled"
                description="Approved actions with due dates appear here so you can see what is coming."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/actions">Go to actions</Link>
                  </Button>
                }
              />
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {data.upcomingActions.map((action) => (
                    <li key={action.id}>
                      <Link
                        href={`/actions/${action.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{action.title}</span>
                            {action.aiGenerated ? (
                              <Sparkles className="size-3.5 shrink-0 text-primary" aria-label="Created from an AI suggestion" />
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {action.assigneeName ?? 'Unassigned'} · due {formatDueDate(action.dueDate)}
                          </span>
                        </span>
                        <PriorityBadge priority={action.priority} />
                        <ActionStatusBadge status={action.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {data.overdueActions.length > 0 ? (
            <section aria-labelledby="overdue-actions">
              <SectionHeader title="Overdue" description="Past their due date and still open" />
              <h2 id="overdue-actions" className="sr-only">
                Overdue actions
              </h2>
              <Card className="border-destructive/30">
                <ul className="divide-y divide-border">
                  {data.overdueActions.map((action) => (
                    <li key={action.id}>
                      <Link
                        href={`/actions/${action.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-destructive/5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{action.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {action.assigneeName ?? 'Unassigned'} · was due {formatDueDate(action.dueDate)}
                          </span>
                        </span>
                        <OverdueBadge />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                AI activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Analyses (7 days)</dt>
                  <dd className="font-medium tabular-nums">{formatNumber(stats.ai.extractionsLast7Days)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Suggestions awaiting review</dt>
                  <dd className="font-medium tabular-nums text-[color-mix(in_oklch,var(--color-warning)_75%,black)]">
                    {formatNumber(stats.ai.suggestionsAwaitingReview)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Approved</dt>
                  <dd className="font-medium tabular-nums text-[color-mix(in_oklch,var(--color-success)_85%,black)]">
                    {formatNumber(stats.ai.suggestionsApproved)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Rejected</dt>
                  <dd className="font-medium tabular-nums">{formatNumber(stats.ai.suggestionsRejected)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <dt className="text-muted-foreground">Approval rate</dt>
                  <dd className="font-medium tabular-nums">
                    {stats.ai.approvalRate === null ? (
                      <span className="text-xs font-normal text-muted-foreground">No reviews yet</span>
                    ) : (
                      formatPercent(stats.ai.approvalRate)
                    )}
                  </dd>
                </div>
              </dl>

              <div className="rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                AI suggestions never become tasks on their own. Every one is reviewed by a person
                before it enters the action list.
              </div>

              <div className="grid gap-2">
                <Button asChild variant="outline" size="sm" className="justify-start">
                  <Link href="/documents?status=REVIEW">
                    <ScanSearch aria-hidden="true" />
                    Review AI suggestions
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="justify-start">
                  <Link href="/documents">
                    <Upload aria-hidden="true" />
                    Upload a document
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No activity recorded yet. Uploads, reviews and status changes are logged here.
                </p>
              ) : (
                <ol className="space-y-3">
                  {data.activity.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs">
                          <span className="font-medium">{describeActivity(entry.action)}</span>
                          {entry.actorName ? (
                            <span className="text-muted-foreground"> · {entry.actorName}</span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {formatRelative(entry.timestamp)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-xs text-muted-foreground">
                {[
                  'Upload document',
                  'Extract text',
                  'AI analysis',
                  'Human review',
                  'Create action',
                  'Track to completion',
                ].map((step, index) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <Clock className="size-3" aria-hidden="true" />
                  {formatNumber(stats.actions.pending)} to do
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {formatNumber(stats.actions.completed)} completed
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  ORGANIZATION_CREATED: 'Organization created',
  MEMBER_ADDED: 'Member added',
  MEMBER_REMOVED: 'Member removed',
  MEMBER_ROLE_CHANGED: 'Member role changed',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_DELETED: 'Document deleted',
  EXTRACTION_STARTED: 'AI analysis started',
  EXTRACTION_COMPLETED: 'AI analysis completed',
  EXTRACTION_FAILED: 'AI analysis failed',
  SUGGESTION_APPROVED: 'Suggestion approved',
  SUGGESTION_REJECTED: 'Suggestion rejected',
  SUGGESTION_EDITED: 'Suggestion edited',
  ACTION_CREATED: 'Action created',
  ACTION_ASSIGNED: 'Action assigned',
  ACTION_STATUS_CHANGED: 'Action status changed',
  ACTION_UPDATED: 'Action updated',
  ACTION_DELETED: 'Action deleted',
  PROJECT_CREATED: 'Project created',
  PROJECT_UPDATED: 'Project updated',
  PROJECT_ARCHIVED: 'Project archived',
};

function describeActivity(action: string): string {
  return ACTIVITY_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();
}