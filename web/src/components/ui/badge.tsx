import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider leading-tight',
  {
    variants: {
      variant: {
        default: 'border-border bg-subtle text-fg-secondary',
        accent: 'border-accent/30 bg-accent-subtle text-accent-fg',
        success: 'border-success/30 bg-success-subtle text-success-fg',
        warning: 'border-warning/30 bg-warning-subtle text-warning-fg',
        danger: 'border-danger/30 bg-danger-subtle text-danger-fg',
        outline: 'border-border-strong bg-transparent text-fg-secondary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
