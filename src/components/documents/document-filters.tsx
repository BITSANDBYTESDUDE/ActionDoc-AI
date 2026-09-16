'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STATUS_CONFIG } from '@/components/shared/status-badges';
import { toQueryString } from '@/lib/utils/api-client';

interface DocumentFiltersProps {
  members: { id: string; name: string }[];
  current: {
    search: string;
    status: string;
    sourceType: string;
    createdById: string;
    sort: string;
    order: string;
  };
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG.DOCUMENT_STATUS).filter(
  ([key], index, all) => all.findIndex(([other]) => other === key) === index,
);

/**
 * Filters are applied server-side by navigating with query parameters, so the
 * browser never holds the full document set and the URL stays shareable.
 */
export function DocumentFilters({ members, current }: DocumentFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(current.search);
  const [syncedSearch, setSyncedSearch] = useState(current.search);

  // Keeps the input in step with back/forward navigation without an effect.
  if (syncedSearch !== current.search) {
    setSyncedSearch(current.search);
    setSearch(current.search);
  }

  function apply(next: Partial<DocumentFiltersProps['current']>) {
    const merged = { ...current, ...next };
    const query = toQueryString({
      search: merged.search,
      status: merged.status,
      sourceType: merged.sourceType,
      createdById: merged.createdById,
      sort: merged.sort,
      order: merged.order,
    });
    startTransition(() => router.push(`/documents${query}`));
  }

  const hasFilters = Boolean(current.search || current.status || current.sourceType || current.createdById);

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ search });
      }}
    >
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="document-search">Search</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="document-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file name…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-status">Status</Label>
        <Select
          id="document-status"
          value={current.status}
          onChange={(event) => apply({ status: event.target.value })}
          className="w-40"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-type">File type</Label>
        <Select
          id="document-type"
          value={current.sourceType}
          onChange={(event) => apply({ sourceType: event.target.value })}
          className="w-32"
        >
          <option value="">All types</option>
          <option value="PDF">PDF</option>
          <option value="DOCX">DOCX</option>
          <option value="TXT">TXT</option>
          <option value="MARKDOWN">Markdown</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-owner">Uploaded by</Label>
        <Select
          id="document-owner"
          value={current.createdById}
          onChange={(event) => apply({ createdById: event.target.value })}
          className="w-44"
        >
          <option value="">Anyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-sort">Sort</Label>
        <Select
          id="document-sort"
          value={`${current.sort}:${current.order}`}
          onChange={(event) => {
            const [sort, order] = event.target.value.split(':');
            apply({ sort: sort ?? 'createdAt', order: order ?? 'desc' });
          }}
          className="w-44"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="displayName:asc">Name A–Z</option>
          <option value="fileSize:desc">Largest first</option>
          <option value="status:asc">Status</option>
        </Select>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Apply
      </Button>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => startTransition(() => router.push('/documents'))}
          disabled={pending}
        >
          <X aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </form>
  );
}