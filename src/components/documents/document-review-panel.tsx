'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Quote,
  PencilLine,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils';
import { formatDueDate } from '@/lib/utils/format';
import { PriorityBadge } from '@/components/shared/status-badges';
import type { ReviewSuggestion } from '@/app/(dashboard)/documents/[id]/page';

interface MemberOption {
  id: string;
  name: string;
  email: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const ACTION_TYPE_LABEL: Record<string, string> = {
  TASK: 'Task',
  DECISION: 'Decision',
  FOLLOW_UP: 'Follow-up',
  DEADLINE: 'Deadline',
  REMINDER: 'Reminder',
};

function confidenceTone(confidence: number): { variant: 'success' | 'info' | 'warning'; label: string } {
  const percent = Math.round(confidence * 100);
  if (percent >= 80) return { variant: 'success', label: `${percent}% confidence` };
  if (percent >= 55) return { variant: 'info', label: `${percent}% confidence` };
  return { variant: 'warning', label: `${percent}% confidence` };
}

/**
 * Human review surface for AI suggestions.
 *
 * A suggestion is only ever a proposal: nothing reaches the action list until
 * one of these buttons is pressed. Approved and rejected items stay visible so
 * the whole review history for a document can be audited.
 */
export function DocumentReviewPanel({
  documentId,
  suggestions,
  members,
  extraction,
}: {
  documentId: string;
  suggestions: ReviewSuggestion[];
  members: MemberOption[];
  extraction: { model: string; promptVersion: string; completedAt: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectId, setProjectId] = useState('');

  const counts = useMemo(
    () => ({
      pending: suggestions.filter((item) => item.status === 'PENDING').length,
      approved: suggestions.filter((item) => item.status === 'APPROVED').length,
      rejected: suggestions.filter((item) => item.status === 'REJECTED').length,
      all: suggestions.length,
    }),
    [suggestions],
  );

  const visible = useMemo(
    () => (filter === 'all' ? suggestions : suggestions.filter((item) => item.status === filter.toUpperCase())),
    [filter, suggestions],
  );

  async function loadProjects() {
    if (projects) return;
    try {
      const result = await api.get<ProjectOption[]>('/api/projects?options=true');
      setProjects(result);
    } catch {
      setProjects([]);
    }
  }

  async function approve(suggestionId: string) {
    setBusyId(suggestionId);
    try {
      await api.post(`/api/documents/${documentId}/review`, {
        decision: 'approve',
        suggestionId,
        ...(projectId ? { projectId } : {}),
      });
      toast({
        tone: 'success',
        title: 'Suggestion approved',
        description: 'A tracked action was created from this suggestion.',
      });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not approve this suggestion',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(suggestionId: string) {
    const reason = window.prompt('Why are you rejecting this suggestion? (optional)');
    if (reason === null) return; // User cancelled.

    setBusyId(suggestionId);
    try {
      await api.post(`/api/documents/${documentId}/review`, {
        decision: 'reject',
        suggestionId,
        ...(reason.trim() ? { rejectionReason: reason.trim() } : {}),
      });
      toast({ tone: 'info', title: 'Suggestion rejected', description: 'No action was created.' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not reject this suggestion',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdits(suggestion: ReviewSuggestion, form: HTMLFormElement) {
    const data = new FormData(form);
    const payload: Record<string, unknown> = { suggestionId: suggestion.suggestionId };

    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const priority = String(data.get('priority') ?? '');
    const assigneeId = String(data.get('assigneeId') ?? '');
    const dueDate = String(data.get('dueDate') ?? '').trim();

    if (title) payload.title = title;
    payload.description = description;
    if (priority) payload.priority = priority;
    payload.assigneeId = assigneeId || null;
    payload.dueDate = dueDate ? new Date(dueDate).toISOString() : null;

    setBusyId(suggestion.suggestionId);
    try {
      await api.patch(`/api/documents/${documentId}/review`, payload);
      toast({
        tone: 'success',
        title: 'Suggestion updated',
        description: 'Your edits are preserved until you approve or reject it.',
      });
      setEditingId(null);
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not save your edits',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="pending">Awaiting review ({counts.pending})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        <details
          className="text-xs"
          onToggle={(event) => {
            if ((event.target as HTMLDetailsElement).open) void loadProjects();
          }}
        >
          <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground">
            Approval options
          </summary>
          <div className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/40 p-2.5">
            <Label htmlFor="approve-project" className="text-[11px]">
              Assign approved actions to a project (optional)
            </Label>
            <Select
              id="approve-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-full"
            >
              <option value="">No project</option>
              {(projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
        </details>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          {filter === 'pending'
            ? 'Nothing is awaiting review. Every suggestion here has been decided.'
            : 'No suggestions in this state.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((suggestion) => {
            const confidence = confidenceTone(suggestion.confidence);
            const isEditing = editingId === suggestion.suggestionId;
            const isExpanded = expandedId === suggestion.suggestionId;
            const isPending = suggestion.status === 'PENDING';

            return (
              <li key={suggestion.suggestionId}>
                <Card
                  className={cn(
                    'p-4',
                    isPending ? 'border-primary/25' : 'border-border opacity-95',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                          AI suggestion
                        </span>
                        <Badge variant="secondary">{ACTION_TYPE_LABEL[suggestion.actionType] ?? suggestion.actionType}</Badge>
                        <Badge variant={confidence.variant}>{confidence.label}</Badge>
                        {suggestion.edited ? <Badge variant="outline">Edited</Badge> : null}
                      </div>
                      <p className="text-sm font-medium leading-snug">{suggestion.title}</p>
                      {suggestion.description ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {suggestion.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {suggestion.status === 'PENDING' ? (
                        <Badge variant="warning">Awaiting review</Badge>
                      ) : suggestion.status === 'APPROVED' ? (
                        <Badge variant="success">Approved</Badge>
                      ) : (
                        <Badge variant="secondary">Rejected</Badge>
                      )}
                      {suggestion.actionId ? (
                        <a
                          href={`/actions/${suggestion.actionId}`}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          View action
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Suggested assignee</dt>
                      <dd className="font-medium">
                        {members.find((member) => member.id === suggestion.assigneeId)?.name ??
                          suggestion.assigneeName ??
                          'Not stated in the document'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Suggested due date</dt>
                      <dd className="font-medium">{formatDueDate(suggestion.dueDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Priority</dt>
                      <dd>
                        <PriorityBadge priority={suggestion.priority} />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-md bg-muted/50 p-2.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Quote className="size-3" aria-hidden="true" />
                      Evidence from the document
                      {suggestion.sourceLocation ? (
                        <span className="font-normal">· {suggestion.sourceLocation}</span>
                      ) : null}
                    </p>
                    <p className="border-l-2 border-primary/40 pl-2.5 text-xs italic leading-relaxed text-muted-foreground">
                      “{suggestion.evidence}”
                    </p>
                  </div>

                  {isEditing ? (
                    <form
                      className="mt-3 space-y-3 rounded-md border border-border p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveEdits(suggestion, event.currentTarget);
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`title-${suggestion.suggestionId}`}>Title</Label>
                        <Input
                          id={`title-${suggestion.suggestionId}`}
                          name="title"
                          defaultValue={suggestion.title}
                          maxLength={300}
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`description-${suggestion.suggestionId}`}>Description</Label>
                        <Textarea
                          id={`description-${suggestion.suggestionId}`}
                          name="description"
                          defaultValue={suggestion.description}
                          maxLength={4000}
                          rows={3}
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`assignee-${suggestion.suggestionId}`}>Assignee</Label>
                          <Select
                            id={`assignee-${suggestion.suggestionId}`}
                            name="assigneeId"
                            defaultValue={suggestion.assigneeId ?? ''}
                          >
                            <option value="">Unassigned</option>
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`due-${suggestion.suggestionId}`}>Due date</Label>
                          <Input
                            id={`due-${suggestion.suggestionId}`}
                            name="dueDate"
                            type="date"
                            defaultValue={suggestion.dueDate ? suggestion.dueDate.slice(0, 10) : ''}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`priority-${suggestion.suggestionId}`}>Priority</Label>
                          <Select
                            id={`priority-${suggestion.suggestionId}`}
                            name="priority"
                            defaultValue={suggestion.priority}
                          >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                          </Select>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        The original AI values and evidence are kept for audit even after editing.
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm" loading={busyId === suggestion.suggestionId}>
                          <Check aria-hidden="true" />
                          Save changes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          disabled={busyId === suggestion.suggestionId}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {isPending ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void approve(suggestion.suggestionId)}
                            loading={busyId === suggestion.suggestionId}
                          >
                            <Check aria-hidden="true" />
                            Approve &amp; create action
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(suggestion.suggestionId)}
                            disabled={busyId === suggestion.suggestionId}
                          >
                            <PencilLine aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void reject(suggestion.suggestionId)}
                            disabled={busyId === suggestion.suggestionId}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X aria-hidden="true" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                          {suggestion.status === 'APPROVED' ? (
                            <p className="flex items-center gap-1.5">
                              <BadgeCheck className="size-3.5 text-[color-mix(in_oklch,var(--color-success)_85%,black)]" aria-hidden="true" />
                              Approved by a reviewer
                              {suggestion.reviewedAt
                                ? ` · ${new Date(suggestion.reviewedAt).toLocaleString()}`
                                : ''}
                            </p>
                          ) : (
                            <p>
                              Rejected
                              {suggestion.rejectionReason ? ` · ${suggestion.rejectionReason}` : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setExpandedId(isExpanded ? null : suggestion.suggestionId)}
                    aria-expanded={isExpanded}
                  >
                    <ChevronDown
                      className={cn('size-3 transition-transform', isExpanded && 'rotate-180')}
                      aria-hidden="true"
                    />
                    {isExpanded ? 'Hide AI provenance' : 'Show AI provenance'}
                  </button>

                  {isExpanded ? (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      Produced by <span className="font-medium">{extraction.model}</span> using prompt{' '}
                      <span className="font-medium">{extraction.promptVersion}</span>
                      {extraction.completedAt
                        ? ` on ${new Date(extraction.completedAt).toLocaleString()}`
                        : ''}
                      . Confidence is a review signal, not a guarantee.
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}