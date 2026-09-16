import Link from 'next/link';
import { FileStack, FileText, SearchX } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { listDocuments } from '@/services/document.service';
import { listMembers } from '@/services/organization.service';
import { documentListQuerySchema } from '@/lib/validation/document';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { DocumentStatusBadge } from '@/components/shared/status-badges';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadDocumentButton } from '@/components/documents/upload-document-button';
import { DocumentFilters } from '@/components/documents/document-filters';
import { Pagination } from '@/components/shared/pagination';
import { formatDateTime, formatFileSize, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Documents' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const raw = await searchParams;

  // Invalid query parameters fall back to defaults rather than erroring, so a
  // stale bookmark still renders a usable page.
  const parsed = documentListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : documentListQuerySchema.parse({});

  const [result, members] = await Promise.all([
    listDocuments({ organizationId: context.organizationId, query }),
    listMembers(context.organizationId),
  ]);

  const isFiltered = Boolean(query.search || query.status || query.sourceType || query.createdById);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Documents"
        description="Every uploaded document, its processing state and the AI review queue."
        actions={<UploadDocumentButton />}
      />

      <DocumentFilters
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        current={{
          search: query.search ?? '',
          status: query.status ?? '',
          sourceType: query.sourceType ?? '',
          createdById: query.createdById ?? '',
          sort: query.sort,
          order: query.order,
        }}
      />

      {result.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={<SearchX />}
            title="No documents match these filters"
            description="Try clearing the search or status filter to see everything in this organization."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/documents">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileStack />}
            title="Your document library is empty"
            description="Upload meeting notes, requirements, reports or client documents. ActionDoc AI reads them and proposes the actions it finds - you decide which become real work."
            action={<UploadDocumentButton label="Upload a document" />}
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                Documents in {context.organizationName}, page {result.page} of {result.totalPages}
              </caption>
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Document
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Uploaded by
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 group">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                          {doc.sourceType}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:text-primary">
                            {doc.displayName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {doc.metadata.wordCount
                              ? `${formatNumber(doc.metadata.wordCount)} words`
                              : doc.mimeType}
                            {doc.metadata.pageCount ? ` · ${doc.metadata.pageCount} pages` : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <DocumentStatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {doc.createdByName ?? 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(doc.createdAt)}
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
              basePath="/documents"
              searchParams={raw}
            />
          </div>
        </Card>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="size-3.5" aria-hidden="true" />
        Files are stored privately. Downloads use short-lived signed URLs and are organization-scoped.
      </p>
    </div>
  );
}