'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Trash2, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

/**
 * Inline row actions for the action list: reassign, change status and delete.
 *
 * Every mutation goes through the same API the detail page uses, so status
 * transitions are validated in one place regardless of entry point.
 */
export function ActionRowActions({
  action,
  members,
  canDelete,
}: {
  action: { id: string; title: string; status: string; priority: string };
  members: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function call(path: string, init: { method: 'PATCH' | 'DELETE'; body?: unknown }) {
    setBusy(true);
    try {
      if (init.method === 'PATCH') {
        await api.patch(path, init.body);
      } else {
        await api.delete(path);
      }
      router.refresh();
      return true;
    } catch (error) {
      toast({
        tone: 'error',
        title: 'That change was not saved',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const transitions: { value: string; label: string }[] = [
    { value: 'TODO', label: 'To do' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Options for ${action.title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Change status</DropdownMenuLabel>
          {transitions
            .filter((transition) => transition.value !== action.status)
            .map((transition) => (
              <DropdownMenuItem
                key={transition.value}
                disabled={busy}
                onSelect={() =>
                  void call(`/api/actions/${action.id}/status`, {
                    method: 'PATCH',
                    body: { status: transition.value },
                  })
                }
              >
                {transition.label}
              </DropdownMenuItem>
            ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAssignOpen(true)} disabled={busy}>
            <UserPlus aria-hidden="true" />
            Reassign
          </DropdownMenuItem>

          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)} disabled={busy}>
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign action</DialogTitle>
            <DialogDescription>
              Only members of this organization can be assigned. The new assignee is notified.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get('assigneeId') ?? '');
              const ok = await call(`/api/actions/${action.id}`, {
                method: 'PATCH',
                body: { assigneeId: value || null },
              });
              if (ok) {
                toast({ tone: 'success', title: 'Assignee updated' });
                setAssignOpen(false);
              }
            }}
            className="space-y-3"
          >
            <Select name="assigneeId" defaultValue="" aria-label="Assignee">
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this action?</DialogTitle>
            <DialogDescription>
              “{action.title}” will be removed from the action list. The change is written to the
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
                const ok = await call(`/api/actions/${action.id}`, { method: 'DELETE' });
                if (ok) {
                  toast({ tone: 'success', title: 'Action deleted' });
                  setDeleteOpen(false);
                }
              }}
            >
              Delete action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}