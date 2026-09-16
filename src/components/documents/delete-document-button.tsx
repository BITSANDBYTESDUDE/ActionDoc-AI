'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

/**
 * Deletes a document (soft delete server-side) and detaches its actions.
 * Restricted to OWNER/ADMIN, which the API enforces independently of the UI.
 */
export function DeleteDocumentButton({
  documentId,
  documentName,
}: {
  documentId: string;
  documentName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/documents/${documentId}`);
      toast({ tone: 'success', title: 'Document deleted' });
      setOpen(false);
      router.push('/documents');
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError ? deleteError.message : 'The document could not be deleted.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Delete document">
        <Trash2 className="text-destructive" aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              “{documentName}” and its AI suggestions will be removed from the library. Actions
              already approved from it are kept and shown as detached from the source document.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()} loading={deleting}>
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}