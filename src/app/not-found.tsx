import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">We couldn&apos;t find that page</h1>
        <p className="text-sm text-muted-foreground">
          The item may have been deleted, or it belongs to a workspace you are not a member of.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/documents">Documents</Link>
        </Button>
      </div>
    </div>
  );
}