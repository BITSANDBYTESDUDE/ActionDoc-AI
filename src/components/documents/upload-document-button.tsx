'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@/config/constants';

interface UploadResult {
  document: { id: string; displayName: string };
  processing: boolean;
}

/**
 * Upload dialog.
 *
 * The file goes to the real upload endpoint; the server validates it, stores it
 * privately and queues processing. If the queue is unavailable the document is
 * still stored and the user can trigger analysis manually from the document
 * page, so a missing worker is never a silent data loss.
 */
export function UploadDocumentButton({
  label = 'Upload document',
  variant = 'default',
  size,
  className,
}: {
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = ALLOWED_UPLOAD_EXTENSIONS.join(',');

  function reset() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function upload() {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await api.post<UploadResult>('/api/documents', formData);

      toast({
        tone: 'success',
        title: 'Document uploaded',
        description: result.processing
          ? 'Text extraction and AI analysis are running in the background.'
          : 'Stored successfully. Start analysis from the document page when ready.',
      });

      setOpen(false);
      reset();
      router.push(`/documents/${result.document.id}`);
      router.refresh();
    } catch (uploadError) {
      const message =
        uploadError instanceof ApiError
          ? (uploadError.fieldMessage ?? uploadError.message)
          : 'The upload failed. Please try again.';
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <UploadCloud aria-hidden="true" />
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
            <DialogDescription>
              PDF, DOCX, TXT or Markdown, up to 25 MB. The file is stored privately and analysed by
              AI - nothing becomes a task until a person approves it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="document-file">File</Label>
              <input
                id="document-file"
                ref={inputRef}
                type="file"
                accept={accept}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
                className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <p className="rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              Documents are treated as untrusted content. Instructions inside a document are never
              executed - they are only ever analysed as data.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={() => void upload()} loading={uploading} disabled={!file}>
              {uploading ? 'Uploading…' : 'Upload and analyse'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}