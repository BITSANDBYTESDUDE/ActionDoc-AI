'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  FileText,
  ScanSearch,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { api } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/format';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ACTION_ASSIGNED: UserPlus,
  ACTION_DUE_SOON: CalendarClock,
  ACTION_OVERDUE: BellRing,
  ACTION_COMPLETED: CheckCircle2,
  DOCUMENT_READY: FileText,
  AI_REVIEW_REQUIRED: ScanSearch,
};

function linkFor(notification: NotificationRow): string | null {
  if (notification.relatedEntityType === 'ACTION' && notification.relatedEntityId) {
    return `/actions/${notification.relatedEntityId}`;
  }
  if (notification.relatedEntityType === 'DOCUMENT' && notification.relatedEntityId) {
    return `/documents/${notification.relatedEntityId}`;
  }
  return null;
}

/**
 * Notification list with optimistic read state.
 *
 * Marking as read calls the real API; the local state is only used to avoid a
 * full round-trip repaint.
 */
export function NotificationsList({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const visible = filter === 'unread' ? items.filter((item) => !item.readAt) : items;

  async function markRead(id: string) {
    const target = items.find((item) => item.id === id);
    if (!target || target.readAt) return;

    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
    );

    try {
      await api.patch(`/api/notifications/${id}`);
    } catch {
      // Revert if the server rejected the change.
      setItems((current) => current.map((item) => (item.id === id ? { ...item, readAt: null } : item)));
    }
  }

  async function markAllRead() {
    setBusy(true);
    const snapshot = items;
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    try {
      await api.post('/api/notifications/read-all');
      toast({ tone: 'success', title: 'All notifications marked as read' });
      router.refresh();
    } catch {
      setItems(snapshot);
      toast({ tone: 'error', title: 'Could not mark all as read' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread')}>
          <TabsList>
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
            <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()} loading={busy}>
            Mark all as read
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="m-4 border-0"
          icon={<BellRing />}
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="When someone assigns you an action, or a document is ready for review, it will show up here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((notification) => {
            const Icon = ICONS[notification.type] ?? BellRing;
            const href = linkFor(notification);

            const content = (
              <span className="flex w-full items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                    notification.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('text-sm', notification.readAt ? 'font-normal' : 'font-medium')}>
                      {notification.title}
                    </span>
                    {!notification.readAt ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {notification.message}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {formatRelative(notification.createdAt)}
                  </span>
                </span>
              </span>
            );

            return (
              <li key={notification.id}>
                <div className={cn('flex items-center gap-3 px-4 py-3', !notification.readAt && 'bg-primary/[0.03]')}>
                  {href ? (
                    <Link
                      href={href}
                      className="flex-1"
                      onClick={() => void markRead(notification.id)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => void markRead(notification.id)}
                    >
                      {content}
                    </button>
                  )}

                  {!notification.readAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => void markRead(notification.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}