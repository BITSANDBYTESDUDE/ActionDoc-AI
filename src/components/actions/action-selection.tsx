'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

interface BulkResult {
  requested: number;
  succeeded: number;
  failed: { actionId: string; reason: string }[];
}

interface ActionSelectionValue {
  selected: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clear: () => void;
  allSelected: (ids: string[]) => boolean;
  someSelected: (ids: string[]) => boolean;
  run: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}

const ActionSelectionContext = React.createContext<ActionSelectionValue | null>(null);

export function useActionSelection(): ActionSelectionValue {
  const context = React.useContext(ActionSelectionContext);
  if (!context) throw new Error('useActionSelection must be used inside <ActionSelectionProvider>.');
  return context;
}

/**
 * Selection state for bulk operations on the action list.
 *
 * The provider is a client component that wraps server-rendered table rows, so
 * the table markup stays on the server while the checkboxes and toolbar share
 * one source of truth. Selection is intentionally not persisted across pages:
 * a bulk edit should only ever affect rows the user can currently see.
 */
export function ActionSelectionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const isSelected = React.useCallback((id: string) => selected.includes(id), [selected]);

  const toggle = React.useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }, []);

  const toggleAll = React.useCallback((ids: string[]) => {
    setSelected((current) => (ids.every((id) => current.includes(id)) ? [] : ids));
  }, []);

  const clear = React.useCallback(() => setSelected([]), []);

  const allSelected = React.useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selected.includes(id)),
    [selected],
  );

  const someSelected = React.useCallback(
    (ids: string[]) => ids.some((id) => selected.includes(id)) && !allSelected(ids),
    [selected, allSelected],
  );

  const run = React.useCallback(
    async (body: Record<string, unknown>) => {
      if (selected.length === 0) return;
      setBusy(true);
      try {
        const result = await api.post<BulkResult>('/api/actions/bulk', {
          ...body,
          actionIds: selected,
        });

        if (result.failed.length === 0) {
          toast({
            tone: 'success',
            title: `${result.succeeded} action${result.succeeded === 1 ? '' : 's'} updated`,
          });
        } else {
          // Partial success is reported honestly rather than as a clean win.
          toast({
            tone: 'error',
            title: `${result.succeeded} updated, ${result.failed.length} skipped`,
            description: result.failed[0]?.reason,
          });
        }

        clear();
        router.refresh();
      } catch (error) {
        toast({
          tone: 'error',
          title: 'That change was not saved',
          description: error instanceof ApiError ? error.message : 'Please try again.',
        });
      } finally {
        setBusy(false);
      }
    },
    [selected, toast, clear, router],
  );

  const value = React.useMemo(
    () => ({ selected, isSelected, toggle, toggleAll, clear, allSelected, someSelected, run, busy }),
    [selected, isSelected, toggle, toggleAll, clear, allSelected, someSelected, run, busy],
  );

  return <ActionSelectionContext.Provider value={value}>{children}</ActionSelectionContext.Provider>;
}