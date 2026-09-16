import Link from 'next/link';
import { FileStack } from 'lucide-react';
import { requireAuth } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreateOrganizationButton } from '@/components/settings/create-organization-button';
import { APP_NAME } from '@/config/constants';
import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Get started' };

/**
 * Shown to an authenticated user who has no organization yet, so they are never
 * dropped into a shell with no workspace and no way forward. Sits outside the
 * dashboard layout because that layout redirects here.
 */
export default async function OnboardingPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');

  const user = await requireAuth();

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2">
        <FileStack className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold">{APP_NAME}</span>
      </div>

      <PageHeader
        title={`Welcome, ${user.name}`}
        description="Create your first workspace to start turning documents into tracked work."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">You are not in an organization yet</CardTitle>
          <CardDescription>
            Each organization is an isolated workspace: its documents, actions, projects and members
            are visible only to its own members.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <CreateOrganizationButton label="Create an organization" />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in as a different account</Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Once your organization exists, upload a document and ActionDoc AI will extract the actions it
        finds inside. Nothing becomes a task until you approve it.
      </p>
    </div>
  );
}