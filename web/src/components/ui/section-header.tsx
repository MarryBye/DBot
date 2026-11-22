import * as React from 'react';
import { cn } from '@/utils/cn';
import { Badge } from './badge';

export interface SectionHeaderProps {
  title: string;
  count?: number | string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  count,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-fg-primary">{title}</h2>
          {count !== undefined && (
            <Badge variant="default" className="tabular-nums">
              {count}
            </Badge>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
