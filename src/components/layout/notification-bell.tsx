'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

const POLL_INTERVAL_MS = 60_000;

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

/**
 * Notification dropdown with an unread indicator.
 *
 * Data is fetched from the real API and re-polled at a low frequency; there is
 * no socket layer yet, so polling keeps the badge reasonably fresh without
 * overwhelming the API.
 */
export function NotificationBell() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // The fetch runs in a promise callback, so state is only set from an
    // external-system update rather than synchronously during the effect body.
    fetch('/api/notifications?limit=8')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data: NotificationsResponse } | null) => {
        if (cancelled || !payload) return;
        setData(payload.data);
      })
      .catch(() => {
        // Notifications are non-critical: a failure leaves the badge empty.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const timer = setInterval(() => setReloadToken((token) => token + 1), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reloadToken]);

  const unread = data?.unreadCount ?? 0;

  async function refresh() {
    try {
      const result = await api.get<NotificationsResponse>('/api/notifications?limit=8');
      setData(result);
    } catch {
      // Non-critical.
    }
  }

  async function markAllRead() {
    try {
      await api.post('/api/notifications/read-all');
      await refresh();
    } catch {
      // Non-critical.
    }
  }

  async function markRead(id: string) {
    try {
      await api.patch(`/api/notifications/${id}`);
      await refresh();
    } catch {
      // Non-critical.
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <DropdownMenuTrigger
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void markAllRead()} className="h-7 px-2 text-xs">
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data && data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void markRead(item.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                      !item.readAt && 'bg-primary/[0.04]',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {!item.readAt ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      ) : null}
                      <span className="flex-1 truncate text-xs font-medium">{item.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                    <span className="line-clamp-2 pl-3.5 text-xs leading-relaxed text-muted-foreground">
                      {item.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                You&apos;re all caught up. Assignments and review requests will appear here.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2.5 py-1.5 text-center text-xs font-medium text-primary hover:bg-accent"
          >
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}