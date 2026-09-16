'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, PencilLine, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

interface ActionDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  projectId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
}

/** Mirrors the server-side transition table so the UI only offers legal moves. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['TODO'],
  CANCELLED: ['TODO'],
};

const STATUS_LABEL: Record<string, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function ActionDetailPanel({
  action,
  members,
  projects,
  canDelete,
}: {
  action: ActionDetail;
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function mutate(
    path: string,
    options: { method: 'PATCH' | 'DELETE'; body?: unknown },
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      if (options.method === 'PATCH') await api.patch(path, options.body);
      else await api.delete(path);
      toast({ tone: 'success', title: successMessage });
      router.refresh();
      return true;
    } catch (error) {
      // The server rejects illegal transitions and cross-organization
      // assignments; surface its message rather than guessing client-side.
      toast({
        tone: 'error',
        title: 'That change was rejected',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = ALLOWED_TRANSITIONS[action.status] ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Move to</p>
        {nextStatuses.length === 0 ? (
          <p className="text-xs text-muted-foreground">No further transitions are available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === 'COMPLETED' ? 'default' : 'outline'}
                disabled={busy}
                onClick={() =>
                  void mutate(
                    `/api/actions/${action.id}/status`,
                    { method: 'PATCH', body: { status } },
                    `Moved to ${STATUS_LABEL[status] ?? status}`,
                  )
                }
              >
                {status === 'COMPLETED' ? <Check aria-hidden="true" /> : null}
                {status === 'CANCELLED' ? <X aria-hidden="true" /> : null}
                {STATUS_LABEL[status] ?? status}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {editing ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const dueDate = String(data.get('dueDate') ?? '').trim();
            const assigneeId = String(data.get('assigneeId') ?? '');
            const projectId = String(data.get('projectId') ?? '');

            const ok = await mutate(
              `/api/actions/${action.id}`,
              {
                method: 'PATCH',
                body: {
                  title: String(data.get('title') ?? '').trim(),
                  description: String(data.get('description') ?? '').trim(),
                  priority: data.get('priority'),
                  assigneeId: assigneeId || null,
                  projectId: projectId || null,
                  dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                },
              },
              'Action updated',
            );
            if (ok) setEditing(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" name="title" defaultValue={action.title} maxLength={300} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" name="description" defaultValue={action.description} rows={4} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-assignee">Assignee</Label>
            <Select id="edit-assignee" name="assigneeId" defaultValue={action.assigneeId ?? ''}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-due">Due date</Label>
              <Input
                id="edit-due"
                name="dueDate"
                type="date"
                defaultValue={action.dueDate ? action.dueDate.slice(0, 10) : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select id="edit-priority" name="priority" defaultValue={action.priority}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-project">Project</Label>
            <Select id="edit-project" name="projectId" defaultValue={action.projectId ?? ''}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy}>
              Save changes
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
            <PencilLine aria-hidden="true" />
            Edit details
          </Button>
          {canDelete ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this action?</DialogTitle>
            <DialogDescription>
              “{action.title}” will be removed from the action list. The deletion is recorded in the
              audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                const ok = await mutate(`/api/actions/${action.id}`, { method: 'DELETE' }, 'Action deleted');
                if (ok) {
                  setDeleteOpen(false);
                  router.push('/actions');
                }
              }}
            >
              Delete action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}