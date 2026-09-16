import { Badge } from '@/components/ui/badge';
import type { ActionPriority, ActionStatus, DocumentStatus, ProjectStatus } from '@/types';

/**
 * Status and priority badges.
 *
 * Centralised so the same status never renders with two different colours or
 * labels anywhere in the product.
 */

const DOCUMENT_STATUS: Record<
  DocumentStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  UPLOADED: { label: 'Uploaded', variant: 'secondary' },
  PROCESSING: { label: 'Processing', variant: 'info' },
  EXTRACTED: { label: 'Analysing', variant: 'info' },
  ANALYZING: { label: 'Analysing', variant: 'info' },
  REVIEW: { label: 'Needs review', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};

const ACTION_STATUS: Record<
  ActionStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  TODO: { label: 'To do', variant: 'secondary' },
  IN_PROGRESS: { label: 'In progress', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' as never },
};

const PRIORITY: Record<
  ActionPriority,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  LOW: { label: 'Low', variant: 'secondary' },
  MEDIUM: { label: 'Medium', variant: 'info' },
  HIGH: { label: 'High', variant: 'warning' },
  URGENT: { label: 'Urgent', variant: 'destructive' },
};

const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  PLANNING: { label: 'Planning', variant: 'secondary' },
  ACTIVE: { label: 'Active', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  ARCHIVED: { label: 'Archived', variant: 'outline' as never },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus | string }) {
  const config = DOCUMENT_STATUS[status as DocumentStatus] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ActionStatusBadge({ status }: { status: ActionStatus | string }) {
  const config = ACTION_STATUS[status as ActionStatus] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: ActionPriority | string }) {
  const config = PRIORITY[priority as ActionPriority] ?? { label: priority, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus | string }) {
  const config = PROJECT_STATUS[status as ProjectStatus] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Marks content produced by AI rather than a human. Uses a distinct look so
 * reviewers can always tell AI output from confirmed work.
 */
export function AiBadge({ confidence }: { confidence?: number | null }) {
  const label =
    typeof confidence === 'number' ? `AI · ${Math.round(confidence * 100)}%` : 'AI suggested';
  return (
    <Badge variant="default" title="Suggested by AI - requires human review">
      {label}
    </Badge>
  );
}

export function OverdueBadge() {
  return <Badge variant="destructive">Overdue</Badge>;
}

export const STATUS_CONFIG = { DOCUMENT_STATUS, ACTION_STATUS, PRIORITY, PROJECT_STATUS };