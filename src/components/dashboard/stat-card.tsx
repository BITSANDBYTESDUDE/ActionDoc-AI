import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Compact metric tile used across the dashboard. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'info' | 'warning' | 'success' | 'destructive';
  href?: string;
}) {
  const toneClass = {
    default: 'text-foreground',
    info: 'text-[color-mix(in_oklch,var(--color-info)_85%,black)]',
    warning: 'text-[color-mix(in_oklch,var(--color-warning)_75%,black)]',
    success: 'text-[color-mix(in_oklch,var(--color-success)_85%,black)]',
    destructive: 'text-destructive',
  }[tone];

  const content = (
    <Card className={cn('h-full transition-colors', href && 'hover:border-primary/40')}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        {icon ? (
          <span className="text-muted-foreground [&_svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={cn('text-2xl font-semibold tabular-nums tracking-tight', toneClass)}>{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );

  if (!href) return content;

  return (
    <a href={href} className="block rounded-lg focus-visible:outline-none">
      {content}
    </a>
  );
}

/** Small inline indicator used for AI metrics. */
export function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <Badge variant="secondary">No confidence</Badge>;
  const percent = Math.round(confidence * 100);
  const variant = percent >= 80 ? 'success' : percent >= 55 ? 'info' : 'warning';
  return <Badge variant={variant}>{percent}% confidence</Badge>;
}