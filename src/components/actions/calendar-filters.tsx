'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Month navigation and calendar filters, driven by query parameters. */
export function CalendarFilters({
  year,
  month,
  members,
  projects,
  currentAssignee,
  currentProject,
}: {
  year: number;
  month: number;
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  currentAssignee: string;
  currentProject: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(nextYear: number, nextMonth: number, overrides: { assignee?: string; project?: string } = {}) {
    const params = new URLSearchParams();
    params.set('month', `${nextYear}-${String(nextMonth).padStart(2, '0')}`);

    const assignee = overrides.assignee ?? currentAssignee;
    const project = overrides.project ?? currentProject;
    if (assignee) params.set('assignee', assignee);
    if (project) params.set('project', project);

    startTransition(() => router.push(`/calendar?${params.toString()}`));
  }

  function shift(delta: number) {
    const target = new Date(year, month - 1 + delta, 1);
    go(target.getFullYear(), target.getMonth() + 1);
  }

  const today = new Date();

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-end gap-1">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} disabled={pending} aria-label="Previous month">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          onClick={() => go(today.getFullYear(), today.getMonth() + 1)}
          disabled={pending}
        >
          Today
        </Button>
        <Button variant="outline" size="icon" onClick={() => shift(1)} disabled={pending} aria-label="Next month">
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar-assignee">Assignee</Label>
        <Select
          id="calendar-assignee"
          value={currentAssignee}
          onChange={(event) => go(year, month, { assignee: event.target.value })}
          className="w-44"
        >
          <option value="">Everyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar-project">Project</Label>
        <Select
          id="calendar-project"
          value={currentProject}
          onChange={(event) => go(year, month, { project: event.target.value })}
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

      {pending ? (
        <span className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading…
        </span>
      ) : null}
    </div>
  );
}