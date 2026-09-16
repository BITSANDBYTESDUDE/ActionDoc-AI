'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

/**
 * Queues (or re-queues) the processing pipeline for a document.
 *
 * Re-running is safe and idempotent: the worker claims a single in-flight
 * extraction per document, so a double click cannot produce duplicate analyses
 * or duplicate suggestions.
 */
export function AnalyzeDocumentButton({
  documentId,
  hasSuggestions,
  variant = 'outline',
  size,
  disabled,
}: {
  documentId: string;
  hasSuggestions: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  async function analyze() {
    setRunning(true);
    try {
      const result = await api.post<{ processing: boolean }>(`/api/documents/${documentId}/analyze`);
      toast({
        tone: result.processing ? 'success' : 'info',
        title: result.processing ? 'Analysis queued' : 'Analysis requested',
        description: result.processing
          ? 'The worker will extract the text and ask the AI for suggestions.'
          : 'The processing queue is unavailable. Check that Redis and the worker are running.',
      });
      router.push(`/documents/${documentId}?analyzed=1`);
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not start analysis',
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void analyze()}
      loading={running}
      disabled={disabled}
    >
      <RefreshCw aria-hidden="true" />
      {hasSuggestions ? 'Re-analyse' : 'Analyse with AI'}
    </Button>
  );
}