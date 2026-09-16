import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success:
          'border-transparent bg-[color-mix(in_oklch,var(--color-success)_15%,transparent)] text-[color-mix(in_oklch,var(--color-success)_80%,black)]',
        warning:
          'border-transparent bg-[color-mix(in_oklch,var(--color-warning)_20%,transparent)] text-[color-mix(in_oklch,var(--color-warning)_70%,black)]',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        info: 'border-transparent bg-[color-mix(in_oklch,var(--color-info)_15%,transparent)] text-[color-mix(in_oklch,var(--color-info)_85%,black)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };