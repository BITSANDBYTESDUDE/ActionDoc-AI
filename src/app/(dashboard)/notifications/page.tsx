import { requireOrganizationMembership } from '@/lib/auth/guards';
import { listNotifications } from '@/services/notification.service';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { NotificationsList } from '@/components/notifications/notifications-list';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const context = await requireOrganizationMembership('VIEWER');

  // Loaded with a generous ceiling; the list itself is server-rendered so there
  // is no client-side fetch waterfall for the first paint.
  const notifications = await listNotifications({
    organizationId: context.organizationId,
    userId: context.userId,
    limit: 100,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Notifications"
        description="Assignments, review requests, due-date reminders and completions."
      />

      <Card className="overflow-hidden">
        <NotificationsList
          initial={notifications.map((notification) => ({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            readAt: notification.readAt ? notification.readAt.toISOString() : null,
            createdAt: notification.createdAt.toISOString(),
            relatedEntityType: notification.relatedEntityType,
            relatedEntityId: notification.relatedEntityId,
          }))}
        />
      </Card>
    </div>
  );
}