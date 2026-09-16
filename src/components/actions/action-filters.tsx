'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toQueryString } from '@/lib/utils/api-client';

interface ActionFiltersProps {
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  current: {
    view: string;
    search: string;
    status: string;
    priority: string;
    assigneeId: string;
    projectId: string;
    aiGenerated: string;
    sort: string;
    order: string;
  };
}

/** Filters navigate with query parameters so the API does the filtering. */
export function ActionFilters({ members, projects, current }: ActionFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(current.search);
  const [syncedSearch, setSyncedSearch] = useState(current.search);

  // When navigation changes the query (browser back/forward, or a chip click),
  // the input follows - adjusted during render rather than in an effect.
  if (syncedSearch !== current.search) {
    setSyncedSearch(current.search);
    setSearch(current.search);
  }

  function apply(next: Partial<ActionFiltersProps['current']>) {
    const merged = { ...current, ...next };
    const query = toQueryString({
      view: merged.view === 'all' ? undefined : merged.view,
      search: merged.search,
      status: merged.status,
      priority: merged.priority,
      assigneeId: merged.assigneeId,
      projectId: merged.projectId,
      aiGenerated: merged.aiGenerated,
      sort: merged.sort,
      order: merged.order,
    });
    startTransition(() => router.push(`/actions${query}`));
  }

  const hasFilters = Boolean(
    current.search ||
      current.status ||
      current.priority ||
      current.assigneeId ||
      current.projectId ||
      current.aiGenerated,
  );

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ search });
      }}
    >
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="action-search">Search</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="action-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action titles…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-status">Status</Label>
        <Select
          id="action-status"
          value={current.status}
          onChange={(event) => apply({ status: event.target.value })}
          className="w-36"
        >
          <option value="">Any</option>
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-priority">Priority</Label>
        <Select
          id="action-priority"
          value={current.priority}
          onChange={(event) => apply({ priority: event.target.value })}
          className="w-32"
        >
          <option value="">Any</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-assignee">Assignee</Label>
        <Select
          id="action-assignee"
          value={current.assigneeId}
          onChange={(event) => apply({ assigneeId: event.target.value })}
          className="w-44"
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-project">Project</Label>
        <Select
          id="action-project"
          value={current.projectId}
          onChange={(event) => apply({ projectId: event.target.value })}
          className="w-44"
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-source">Origin</Label>
        <Select
          id="action-source"
          value={current.aiGenerated}
          onChange={(event) => apply({ aiGenerated: event.target.value })}
          className="w-36"
        >
          <option value="">Any origin</option>
          <option value="true">AI suggested</option>
          <option value="false">Created by a person</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="action-sort">Sort</Label>
        <Select
          id="action-sort"
          value={`${current.sort}:${current.order}`}
          onChange={(event) => {
            const [sort, order] = event.target.value.split(':');
            apply({ sort: sort ?? 'createdAt', order: order ?? 'desc' });
          }}
          className="w-44"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="dueDate:asc">Due soonest</option>
          <option value="dueDate:desc">Due latest</option>
          <option value="priority:desc">Priority</option>
          <option value="title:asc">Title A–Z</option>
        </Select>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Apply
      </Button>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            startTransition(() => router.push(current.view === 'all' ? '/actions' : `/actions?view=${current.view}`))
          }
          disabled={pending}
        >
          <X aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </form>
  );
}