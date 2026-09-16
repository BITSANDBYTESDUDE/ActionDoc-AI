'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Client-side error boundary for the dashboard.
 *
 * Shows a safe message and the Next.js error digest only - never a stack trace.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged in the browser so the digest can be correlated with server logs.
    console.error('[ui] dashboard error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page could not be loaded. The error has been logged.
          {error.digest ? (
            <>
              {' '}
              Reference: <code className="rounded bg-muted px-1 py-0.5 text-xs">{error.digest}</code>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}