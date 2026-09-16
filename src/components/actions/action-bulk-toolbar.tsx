'use client';

import { useState } from 'react';
import { CalendarClock, Flag, Trash2, UserPlus, X } from 'lucide-react';
import { useActionSelection } from '@/components/actions/action-selection';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BulkDialog = 'status' | 'assign' | 'priority' | 'delete' | null;

/**
 * Toolbar that appears once rows are selected.
 *
 * Each dialog calls `run` with the discriminator the API expects, so the client
 * never sends a field the server would ignore.
 */
export function ActionBulkToolbar({
  members,
}: {
  members: { id: string; name: string }[];
}) {
  const { selected, clear, run, busy } = useActionSelection();
  const [dialog, setDialog] = useState<BulkDialog>(null);

  if (selected.length === 0) return null;

  const count = selected.length;

  async function submit(body: Record<string, unknown>) {
    await run(body);
    setDialog(null);
  }

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2"
      >
        <p aria-live="polite" className="text-sm font-medium">
          {count} selected
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDialog('status')} disabled={busy}>
            <CalendarClock aria-hidden="true" />
            Change status
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('assign')} disabled={busy}>
            <UserPlus aria-hidden="true" />
            Assign
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('priority')} disabled={busy}>
            <Flag aria-hidden="true" />
            Set priority
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('delete')} disabled={busy}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>

        <Button size="sm" variant="ghost" className="ml-auto" onClick={clear} disabled={busy}>
          <X aria-hidden="true" />
          Clear selection
        </Button>
      </div>

      <Dialog open={dialog === 'status'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status of {count} actions</DialogTitle>
            <DialogDescription>
              Only transitions that are valid for each action will be applied. The rest are
              reported back to you.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const status = String(new FormData(event.currentTarget).get('status') ?? 'TODO');
              void submit({ operation: 'status', status });
            }}
            className="space-y-3"
          >
            <Select name="status" defaultValue="IN_PROGRESS" aria-label="New status">
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'assign'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {count} actions</DialogTitle>
            <DialogDescription>
              Only members of this organization can be assigned. Each new assignee is notified.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get('assigneeId') ?? '');
              void submit({ operation: 'assign', assigneeId: value || null });
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
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'priority'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set priority of {count} actions</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const priority = String(new FormData(event.currentTarget).get('priority') ?? 'MEDIUM');
              void submit({ operation: 'priority', priority });
            }}
            className="space-y-3"
          >
            <Select name="priority" defaultValue="HIGH" aria-label="New priority">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} actions?</DialogTitle>
            <DialogDescription>
              They are removed from the action list. Each deletion is written to the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={() => void submit({ operation: 'delete' })}
            >
              Delete {count} actions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}