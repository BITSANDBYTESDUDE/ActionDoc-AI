'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
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
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

/** Status changes and archiving for a project. */
export function ProjectActions({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function updateStatus(next: string) {
    if (next === status) return;
    setBusy(true);
    try {
      await api.patch(`/api/projects/${projectId}`, { status: next });
      toast({ tone: 'success', title: 'Project status updated' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not update the project',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      const result = await api.delete<{ detachedActions: number }>(`/api/projects/${projectId}`);
      toast({
        tone: 'success',
        title: 'Project archived',
        description:
          result.detachedActions > 0
            ? `${result.detachedActions} open action(s) were detached so nothing is orphaned.`
            : 'The project was archived.',
      });
      setArchiveOpen(false);
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not archive the project',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Select
        value={status}
        onChange={(event) => void updateStatus(event.target.value)}
        disabled={busy || status === 'ARCHIVED'}
        aria-label="Project status"
        className="w-36"
      >
        <option value="PLANNING">Planning</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        {status === 'ARCHIVED' ? <option value="ARCHIVED">Archived</option> : null}
      </Select>

      {status !== 'ARCHIVED' ? (
        <Button variant="ghost" onClick={() => setArchiveOpen(true)} disabled={busy}>
          <Archive aria-hidden="true" />
          Archive
        </Button>
      ) : null}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this project?</DialogTitle>
            <DialogDescription>
              The project moves out of the active list. Any open actions stay in the Action Center
              but are detached from the project, so no work is lost or orphaned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void archive()} loading={busy}>
              Archive project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}