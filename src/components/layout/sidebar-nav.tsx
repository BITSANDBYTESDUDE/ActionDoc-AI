'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  FileText,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/actions', label: 'Actions', icon: ListChecks },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Longest-prefix match so nested routes keep their section highlighted. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  counts,
  onNavigate,
}: {
  counts?: { openActions?: number; reviewDocuments?: number };
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const badges: Record<string, number | undefined> = {
    '/actions': counts?.openActions,
    '/documents': counts?.reviewDocuments,
  };

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const badge = badges[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{item.label}</span>
            {badge ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}