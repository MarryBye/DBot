import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';

const alertVariants = cva(
  'flex items-start gap-2.5 rounded-[2px] border border-l-[3px] px-3.5 py-2.5 text-sm',
  {
    variants: {
      variant: {
        info: 'border-border border-l-accent bg-accent-subtle text-accent-fg',
        success: 'border-border border-l-success bg-success-subtle text-success-fg',
        warning: 'border-border border-l-warning bg-warning-subtle text-warning-fg',
        danger: 'border-border border-l-danger bg-danger-subtle text-danger-fg',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
);

const DEFAULT_ICON: Record<NonNullable<VariantProps<typeof alertVariants>['variant']>, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  danger: 'alert-triangle',
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: IconName;
}

export function Alert({ className, variant = 'info', icon, children, ...props }: AlertProps) {
  const resolvedIcon = icon ?? DEFAULT_ICON[variant ?? 'info'];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon name={resolvedIcon} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
    </div>
  );
}
