'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';
import type { OrganizationSummary } from '@/services/organization.service';

interface OrgSwitcherProps {
  organizations: OrganizationSummary[];
  activeOrganizationId: string;
}

/**
 * Organization switcher.
 *
 * The selection is sent to the server, which re-checks membership before
 * writing the active-organization cookie - switching organizations is never a
 * client-trusted operation.
 */
export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const active = organizations.find((org) => org.id === activeOrganizationId) ?? organizations[0];

  async function switchOrganization(organizationId: string) {
    if (organizationId === active?.id) return;
    setSwitchingTo(organizationId);
    try {
      await api.post('/api/organizations/switch', { organizationId });
      startTransition(() => router.refresh());
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not switch organization',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
        aria-label="Switch organization"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">
          {active?.name?.slice(0, 1).toUpperCase() ?? <Building2 className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{active?.name ?? 'No organization'}</span>
        {pending || switchingTo ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => void switchOrganization(org.id)}
            className="justify-between"
          >
            <span className="truncate">{org.name}</span>
            {org.id === active?.id ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}