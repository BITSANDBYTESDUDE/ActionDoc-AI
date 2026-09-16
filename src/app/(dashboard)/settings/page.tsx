import { requireOrganizationMembership } from '@/lib/auth/guards';
import { listOrganizationsForUser, listMembers, getOrganization } from '@/services/organization.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { OrganizationSettingsForm } from '@/components/settings/organization-settings-form';
import { CreateOrganizationButton } from '@/components/settings/create-organization-button';
import { MemberManager } from '@/components/settings/member-manager';
import { getAiConfigurationStatus } from '@/lib/ai';
import { getStorage } from '@/lib/storage';
import { isQueueConfigured } from '@/lib/queue/document.queue';
import { isEmailConfigured } from '@/lib/notifications/email';
import { formatDateTime } from '@/lib/utils/format';
import type { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const context = await requireOrganizationMembership('VIEWER');

  const [organization, organizations, members] = await Promise.all([
    getOrganization(context.organizationId),
    listOrganizationsForUser(String(context.userId)),
    listMembers(context.organizationId),
  ]);

  const canEdit = context.role === 'OWNER' || context.role === 'ADMIN';

  // Real integration status - surfaced so operators can see at a glance which
  // external services are actually wired up in this environment.
  const ai = getAiConfigurationStatus();

  const integrations = [
    {
      name: 'OpenAI',
      configured: ai.configured,
      detail: ai.configured ? `Model ${ai.model}` : 'OPENAI_API_KEY is not set',
    },
    { name: 'Object storage (S3/R2)', configured: getStorage().isConfigured, detail: 'Private bucket for document uploads' },
    { name: 'Redis queue (BullMQ)', configured: isQueueConfigured(), detail: 'Background document processing' },
    { name: 'Resend email', configured: isEmailConfigured(), detail: 'Assignment and due-date emails' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your workspace, its members and the integrations this deployment uses."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Organization</CardTitle>
          <CardDescription>
            Created {formatDateTime(organization.createdAt)} · slug {organization.slug}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationSettingsForm
            organizationId={String(context.organizationId)}
            name={organization.name}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members</CardTitle>
          <CardDescription>
            Roles are enforced on every request. Viewers can read everything in this organization and
            change nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberManager
            organizationId={String(context.organizationId)}
            members={members.map((member) => ({
              membershipId: member.membershipId,
              userId: member.userId,
              name: member.name,
              email: member.email,
              role: member.role,
              isPrimaryOwner: member.isPrimaryOwner,
            }))}
            currentUserId={String(context.userId)}
            currentRole={context.role as UserRole}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your organizations</CardTitle>
          <CardDescription>
            Switch between workspaces from the sidebar. Data is never shared between them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border rounded-md border border-border">
            {organizations.map((org) => (
              <li key={org.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{org.name}</span>
                  <span className="block text-xs text-muted-foreground">{org.slug}</span>
                </span>
                <span className="flex items-center gap-2">
                  {org.id === String(context.organizationId) ? (
                    <Badge variant="info">Active</Badge>
                  ) : null}
                  <Badge variant="secondary">{org.role.toLowerCase()}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <CreateOrganizationButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Integrations</CardTitle>
          <CardDescription>
            Status is read from the running configuration, not hardcoded. Unconfigured services
            degrade gracefully and log a clear reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {integrations.map((integration) => (
              <li key={integration.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{integration.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{integration.detail}</span>
                </span>
                <Badge variant={integration.configured ? 'success' : 'warning'}>
                  {integration.configured ? 'Configured' : 'Not configured'}
                </Badge>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            See <code className="rounded bg-muted px-1 py-0.5">.env.example</code> for the full list of
            environment variables. Secrets are only ever read on the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}