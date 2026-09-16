import Link from 'next/link';
import { FolderKanban, SearchX } from 'lucide-react';
import { requireOrganizationMembership } from '@/lib/auth/guards';
import { listProjects } from '@/services/project.service';
import { projectListQuerySchema } from '@/lib/validation/project';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ProjectStatusBadge } from '@/components/shared/status-badges';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { ProjectCreateButton } from '@/components/projects/project-create-button';
import { TaskProgress } from '@/components/projects/task-progress';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Projects' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireOrganizationMembership('VIEWER');
  const raw = await searchParams;

  const parsed = projectListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : projectListQuerySchema.parse({});

  const result = await listProjects({ organizationId: context.organizationId, query });
  const isFiltered = Boolean(query.search || query.status);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Projects"
        description="Group related actions into a body of work, with live progress from the actions themselves."
        actions={<ProjectCreateButton />}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3" action="/projects">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="project-search" className="text-xs font-medium">
            Search
          </label>
          <input
            id="project-search"
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Search projects…"
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="project-status" className="text-xs font-medium">
            Status
          </label>
          <select
            id="project-status"
            name="status"
            defaultValue={query.status ?? ''}
            className="select-caret h-9 w-40 cursor-pointer rounded-md border border-input bg-card px-3 pr-8 text-sm shadow-sm"
          >
            <option value="">Active projects</option>
            <option value="PLANNING">Planning</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <input type="checkbox" name="includeArchived" value="true" defaultChecked={query.includeArchived} />
          Include archived
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button asChild variant="ghost">
            <Link href="/projects">Clear</Link>
          </Button>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={isFiltered ? <SearchX /> : <FolderKanban />}
          title={isFiltered ? 'No projects match these filters' : 'No projects yet'}
          description={
            isFiltered
              ? 'Try clearing the search or status filter.'
              : 'Create a project to group actions into a deliverable - client work, a launch, a quarter’s roadmap.'
          }
          action={isFiltered ? undefined : <ProjectCreateButton label="Create a project" />}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((project) => (
              <Card key={project.id} className="transition-colors hover:border-primary/40">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm font-semibold leading-snug hover:text-primary"
                    >
                      {project.name}
                    </Link>
                    <ProjectStatusBadge status={project.status} />
                  </div>

                  {project.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}

                  <TaskProgress counts={project.actionCounts} />

                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>Owner</dt>
                      <dd className="font-medium text-foreground">{project.ownerName ?? 'Unassigned'}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Due</dt>
                      <dd className="font-medium text-foreground">
                        {project.endDate ? formatDate(project.endDate) : 'No end date'}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            pageSize={result.pageSize}
            basePath="/projects"
            searchParams={raw}
          />
        </>
      )}
    </div>
  );
}