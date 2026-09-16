import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  Download,
  FileWarning,
  Info,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { getDocumentDetail } from '@/services/document.service';
import { getLatestExtraction, listExtractionsForDocument } from '@/services/extraction.service';
import { listActionsForDocument } from '@/services/action.service';
import { AppError } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ActionStatusBadge, AiBadge, DocumentStatusBadge, PriorityBadge } from '@/components/shared/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatDateTime, formatFileSize, formatNumber } from '@/lib/utils/format';
import { DocumentReviewPanel } from '@/components/documents/document-review-panel';
import { AnalyzeDocumentButton } from '@/components/documents/analyze-document-button';
import { DeleteDocumentButton } from '@/components/documents/delete-document-button';
import type { SuggestionStatus } from '@/types';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: PageParams }) {
  const { id } = await params;
  return { title: `Document ${id.slice(-6)}` };
}

/** Serialised suggestion shape passed to the client review panel. */
export interface ReviewSuggestion {
  suggestionId: string;
  title: string;
  description: string;
  assigneeName: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string;
  actionType: string;
  confidence: number;
  evidence: string;
  sourceLocation: string | null;
  status: SuggestionStatus;
  actionId: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  edited: boolean;
  /** AI's original proposal, kept once a reviewer edits the suggestion. */
  original: {
    title: string;
    description: string;
    assigneeName: string | null;
    dueDate: string | null;
    priority: string;
  } | null;
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireOrganizationMembership('VIEWER');
  const { id } = await params;
  const raw = await searchParams;

  let document;
  try {
    document = await getDocumentDetail({ organizationId: context.organizationId, documentId: id });
  } catch (error) {
    // A document from another organization is indistinguishable from a missing
    // one - never confirm existence across tenants.
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const [extraction, extractions, actions, members] = await Promise.all([
    getLatestExtraction({ organizationId: context.organizationId, documentId: id }),
    listExtractionsForDocument({ organizationId: context.organizationId, documentId: id }),
    listActionsForDocument({ organizationId: context.organizationId, documentId: id }),
    listMembersForReview(context.organizationId),
  ]);

  const suggestions: ReviewSuggestion[] = (extraction?.actions ?? []).map((suggestion) => ({
    suggestionId: suggestion.suggestionId,
    title: suggestion.title,
    description: suggestion.description ?? '',
    assigneeName: suggestion.assigneeName ?? null,
    assigneeId: suggestion.assigneeId ? String(suggestion.assigneeId) : null,
    dueDate: suggestion.dueDate ? new Date(suggestion.dueDate).toISOString() : null,
    priority: suggestion.priority,
    actionType: suggestion.actionType,
    confidence: suggestion.confidence,
    evidence: suggestion.evidence,
    sourceLocation: suggestion.sourceLocation ?? null,
    status: suggestion.status as SuggestionStatus,
    actionId: suggestion.actionId ? String(suggestion.actionId) : null,
    reviewerId: suggestion.reviewerId ? String(suggestion.reviewerId) : null,
    reviewedAt: suggestion.reviewedAt ? new Date(suggestion.reviewedAt).toISOString() : null,
    rejectionReason: suggestion.rejectionReason ?? null,
    edited: Boolean(suggestion.edited),
    original: suggestion.original
      ? {
          title: suggestion.original.title,
          description: suggestion.original.description ?? '',
          assigneeName: suggestion.original.assigneeName ?? null,
          dueDate: suggestion.original.dueDate
            ? new Date(suggestion.original.dueDate).toISOString()
            : null,
          priority: suggestion.original.priority,
        }
      : null,
  }));

  const pendingCount = suggestions.filter((suggestion) => suggestion.status === 'PENDING').length;
  const analyzed = raw.analyzed === '1';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/documents">
            <ArrowLeft aria-hidden="true" />
            Documents
          </Link>
        </Button>

        <PageHeader
          title={document.displayName}
          description={
            document.summary ||
            'AI suggested actions live here until a reviewer approves or rejects them.'
          }
          actions={
            <>
              {document.downloadUrl ? (
                <Button asChild variant="outline">
                  <a href={document.downloadUrl} download>
                    <Download aria-hidden="true" />
                    Download
                  </a>
                </Button>
              ) : null}
              <AnalyzeDocumentButton
                documentId={document.id}
                hasSuggestions={suggestions.length > 0}
                disabled={document.status === 'PROCESSING' || document.status === 'ANALYZING'}
              />
              {context.role === 'OWNER' || context.role === 'ADMIN' ? (
                <DeleteDocumentButton documentId={document.id} documentName={document.displayName} />
              ) : null}
            </>
          }
        />
      </div>

      {analyzed ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs"
        >
          <Info className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            Analysis queued. This page will show results once the worker finishes - refresh in a
            moment.
          </p>
        </div>
      ) : null}

      {document.status === 'FAILED' && document.failureReason ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
        >
          <FileWarning className="mt-px size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-destructive">Processing failed</p>
            <p className="text-muted-foreground">{document.failureReason}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="ai-review">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle id="ai-review" className="flex items-center gap-2 text-sm">
                  <ScanSearch className="size-4 text-primary" aria-hidden="true" />
                  AI suggestions
                </CardTitle>
                {suggestions.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {pendingCount} awaiting review · {suggestions.length} total
                  </span>
                ) : null}
              </CardHeader>
              <CardContent>
                {suggestions.length === 0 ? (
                  <EmptyState
                    icon={<ScanSearch />}
                    title={
                      extraction?.status === 'FAILED'
                        ? 'The last analysis failed'
                        : extraction
                          ? 'No actions found in this document'
                          : 'Not analysed yet'
                    }
                    description={
                      extraction?.error
                        ? extraction.error
                        : 'Run AI analysis to detect tasks, decisions and deadlines. Every suggestion is a proposal until a reviewer approves it.'
                    }
                    action={
                      <AnalyzeDocumentButton
                        documentId={document.id}
                        hasSuggestions={false}
                        variant="outline"
                        size="sm"
                      />
                    }
                  />
                ) : (
                  <DocumentReviewPanel
                    documentId={document.id}
                    suggestions={suggestions}
                    members={members}
                    extraction={{
                      model: extraction?.model ?? 'unknown',
                      promptVersion: extraction?.promptVersion ?? 'unknown',
                      completedAt: extraction?.processingCompletedAt
                        ? new Date(extraction.processingCompletedAt).toISOString()
                        : null,
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="confirmed-actions">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle id="confirmed-actions" className="text-sm">
                  Confirmed actions ({actions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {actions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing has been approved from this document yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {actions.map((action) => (
                      <li key={action.id}>
                        <Link
                          href={`/actions/${action.id}`}
                          className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{action.title}</span>
                              {action.aiGenerated ? <AiBadge confidence={action.aiConfidence} /> : null}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {action.assigneeName ?? 'Unassigned'} ·{' '}
                              {action.dueDate ? formatDateTime(action.dueDate) : 'No due date'}
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
          </section>

          {document.extractedText ? (
            <section aria-labelledby="extracted-text">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle id="extracted-text" className="text-sm">
                    Extracted text
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                    {document.extractedText}
                  </pre>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Document details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <DocumentStatusBadge status={document.status} />
              </div>
              <Separator />
              <dl className="space-y-2">
                <Detail label="Type" value={document.sourceType} />
                <Detail label="Size" value={formatFileSize(document.fileSize)} />
                <Detail
                  label="Pages"
                  value={document.metadata.pageCount ? String(document.metadata.pageCount) : '—'}
                />
                <Detail
                  label="Words"
                  value={document.metadata.wordCount ? formatNumber(document.metadata.wordCount) : '—'}
                />
                <Detail label="Uploaded by" value={document.createdByName ?? 'Unknown'} />
                <Detail label="Uploaded" value={formatDateTime(document.createdAt)} />
                <Detail
                  label="Extraction"
                  value={document.metadata.extractionMethod ?? '—'}
                />
                <Detail label="Analyses" value={String(extractions.length)} />
              </dl>

              {document.metadata.warnings.length > 0 ? (
                <div className="rounded-md border border-[color-mix(in_oklch,var(--color-warning)_40%,transparent)] bg-[color-mix(in_oklch,var(--color-warning)_10%,transparent)] p-2.5">
                  <p className="mb-1 font-medium">Extraction warnings</p>
                  <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {document.metadata.warnings.slice(0, 5).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {extraction ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Analysis provenance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Detail label="Model" value={extraction.model} />
                <Detail label="Prompt version" value={extraction.promptVersion} />
                <Detail label="Extraction version" value={extraction.extractionVersion} />
                <Detail label="Status" value={extraction.status} />
                <Detail
                  label="Completed"
                  value={
                    extraction.processingCompletedAt
                      ? formatDateTime(extraction.processingCompletedAt)
                      : '—'
                  }
                />
                <p className="pt-1 leading-relaxed text-muted-foreground">
                  Stored with each analysis so results can be traced back to the exact prompt and
                  model that produced them.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                How review works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                AI suggestions are proposals. They carry the evidence that justified them, but the
                model cannot create, delete or assign anything on its own.
              </p>
              <p className="flex items-start gap-2">
                <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Approving creates a real action with you recorded as the reviewer.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium">{value}</dd>
    </div>
  );
}

/** Members are needed to resolve a suggestion's assignee name during review. */
async function listMembersForReview(organizationId: import('mongoose').Types.ObjectId) {
  const { listMembers } = await import('@/services/organization.service');
  const members = await listMembers(organizationId);
  return members.map((member) => ({ id: member.userId, name: member.name, email: member.email }));
}