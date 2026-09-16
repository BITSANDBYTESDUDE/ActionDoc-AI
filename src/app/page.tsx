import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle2, FileStack, ScanSearch, Sparkles } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/config/constants';

export const dynamic = 'force-dynamic';

export const metadata = { title: `${APP_NAME} - ${APP_TAGLINE}` };

const PIPELINE = [
  {
    icon: FileStack,
    title: 'Upload',
    body: 'Drop in meeting notes, specs, client briefs, reports or business plans.',
  },
  {
    icon: Sparkles,
    title: 'AI analysis',
    body: 'The document is read and every task, decision and deadline is surfaced with evidence.',
  },
  {
    icon: ScanSearch,
    title: 'Human review',
    body: 'A person approves, edits or rejects each suggestion. Nothing is created automatically.',
  },
  {
    icon: CheckCircle2,
    title: 'Track to done',
    body: 'Approved items become real actions with owners, due dates and status transitions.',
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-12 px-6 py-16">
      <header className="space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <FileStack className="size-3.5 text-primary" aria-hidden="true" />
          {APP_NAME}
        </span>

        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {APP_TAGLINE}
        </h1>

        <p className="max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          {APP_DESCRIPTION}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/register">
              Get started
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <section aria-label="How it works">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step, index) => (
            <Card key={step.title}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <step.icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Step {index + 1}
                  </span>
                </div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        AI suggests. Humans approve. The system executes and tracks. Uploaded documents are treated as
        untrusted data - instructions inside them are never executed.
      </p>
    </div>
  );
}