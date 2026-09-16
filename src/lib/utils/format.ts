import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';

/** Consistent date formatting helpers so the UI never renders raw ISO strings. */

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy');
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy, HH:mm');
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Human due-date label: Today / Tomorrow / Yesterday / 12 Mar 2026. */
export function formatDueDate(value: Date | string | null | undefined): string {
  if (!value) return 'No due date';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'No due date';
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM yyyy');
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number') return '—';
  return new Intl.NumberFormat().format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') return '—';
  return `${Math.round(value * 100)}%`;
}

/** ISO date (yyyy-MM-dd) key used for grouping calendar data. */
export function toDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return format(date, 'yyyy-MM-dd');
}

export { isToday, isTomorrow, isYesterday };