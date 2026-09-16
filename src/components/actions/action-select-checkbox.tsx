'use client';

import { useActionSelection } from '@/components/actions/action-selection';

/**
 * Row checkbox for the action table.
 *
 * Rendered as a real `<input type="checkbox">` with an accessible label rather
 * than a styled button, so keyboard and screen-reader behaviour comes from the
 * platform.
 */
export function ActionSelectCheckbox({
  actionId,
  title,
}: {
  actionId: string;
  title: string;
}) {
  const { isSelected, toggle } = useActionSelection();
  const checked = isSelected(actionId);

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => toggle(actionId)}
      aria-label={`Select "${title}"`}
      className="size-4 cursor-pointer rounded border-border accent-primary"
    />
  );
}

/** Header checkbox that selects or clears every row on the current page. */
export function ActionSelectAllCheckbox({ ids }: { ids: string[] }) {
  const { allSelected, someSelected, toggleAll } = useActionSelection();

  return (
    <input
      type="checkbox"
      checked={allSelected(ids)}
      ref={(node) => {
        // Indeterminate is a DOM property, not an attribute React can set.
        if (node) node.indeterminate = someSelected(ids);
      }}
      onChange={() => toggleAll(ids)}
      disabled={ids.length === 0}
      aria-label="Select all actions on this page"
      className="size-4 cursor-pointer rounded border-border accent-primary"
    />
  );
}