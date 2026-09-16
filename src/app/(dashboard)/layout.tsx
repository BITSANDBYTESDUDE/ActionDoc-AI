import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { resolveOrganizationContext } from '@/lib/auth/guards';
import { listOrganizationsForUser } from '@/services/organization.service';
import { getDashboardData } from '@/services/dashboard.service';
import { AppShell } from '@/components/layout/app-shell';
import { ForbiddenError, ValidationError } from '@/lib/errors';

/**
 * Authenticated application shell.
 *
 * The organization context is resolved server-side on every request so the
 * sidebar, role badge and organization switcher always reflect verified data.
 * A user without any organization is sent to onboarding rather than shown a
 * broken shell.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const organizations = await listOrganizationsForUser(user.id);

  if (organizations.length === 0) redirect('/onboarding');

  let context;
  try {
    context = await resolveOrganizationContext({ user });
  } catch (error) {
    // Cookie points at an organization the user no longer belongs to (removed
    // member, archived org): fall back to the first available one.
    if (error instanceof ForbiddenError) {
      const first = organizations[0];
      if (first) {
        context = await resolveOrganizationContext({ user, organizationId: first.id });
      } else {
        redirect('/onboarding');
      }
    } else if (error instanceof ValidationError) {
      redirect('/onboarding');
    } else {
      throw error;
    }
  }

  const dashboard = await getDashboardData({
    organizationId: context.organizationId,
    userId: context.userId,
    recentLimit: 1,
  });

  return (
    <AppShell
      organizations={organizations}
      activeOrganizationId={String(context.organizationId)}
      user={{ name: user.name, email: user.email }}
      role={context.role}
      counts={{
        openActions: dashboard.stats.actions.pending + dashboard.stats.actions.inProgress,
        reviewDocuments: dashboard.stats.documents.review,
      }}
    >
      {children}
    </AppShell>
  );
}