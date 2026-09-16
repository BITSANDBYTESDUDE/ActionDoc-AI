'use client';

import { signOut } from 'next-auth/react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UserRole } from '@/types';

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: UserRole;
}) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent"
        aria-label="Open account menu"
      >
        {initials || <UserRound className="size-4" aria-hidden="true" />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">{ROLE_LABEL[role]} access</div>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-3.5" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: '/login' })}>
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}