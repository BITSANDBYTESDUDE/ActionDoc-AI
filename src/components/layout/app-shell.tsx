'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FileStack, Menu, X } from 'lucide-react';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { OrgSwitcher } from '@/components/layout/org-switcher';
import { NotificationBell } from '@/components/layout/notification-bell';
import { UserMenu } from '@/components/layout/user-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/config/constants';
import type { OrganizationSummary } from '@/services/organization.service';
import type { UserRole } from '@/types';

interface AppShellProps {
  children: React.ReactNode;
  organizations: OrganizationSummary[];
  activeOrganizationId: string;
  user: { name: string; email: string };
  role: UserRole;
  counts?: { openActions?: number; reviewDocuments?: number; unreadNotifications?: number };
}

export function AppShell({
  children,
  organizations,
  activeOrganizationId,
  user,
  role,
  counts,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Adjusting state when the route changes, rather than reacting in an effect:
  // the drawer must be closed for the new route, and rendering it closed first
  // avoids a visible flash of the previous route's drawer.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  // Prevent the page behind the drawer from scrolling while it is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-dvh bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <FileStack className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold">{APP_NAME}</span>
        </div>
        <div className="border-b border-border p-2">
          <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <SidebarNav counts={counts} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileStack className="size-4 text-primary" aria-hidden="true" />
                {APP_NAME}
              </span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X />
              </Button>
            </div>
            <div className="border-b border-border p-2">
              <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <SidebarNav counts={counts} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>

          <div className="lg:hidden">
            <span className="text-sm font-semibold">{APP_NAME}</span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu name={user.name} email={user.email} role={role} />
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          Powered by{' '}
          <a
            href="http://bitsandbytesdude.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            BITSANDBYTESDUDE
          </a>
        </footer>
      </div>
    </div>
  );
}