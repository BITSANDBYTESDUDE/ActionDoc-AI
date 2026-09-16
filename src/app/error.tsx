'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Top-level error boundary; never renders a stack trace to the user. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              We hit an unexpected error loading this page.
              {error.digest ? (
                <>
                  {' '}
                  Reference: <code>{error.digest}</code>
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
      </body>
    </html>
  );
}