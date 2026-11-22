import * as React from 'react';
import { cn } from '@/utils/cn';
import { Badge } from './badge';
import { TruncatedText } from './truncated-text';

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
    <div className={cn('flex min-w-0 flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <TruncatedText
            text={title}
            as="h3"
            className="text-base font-semibold tracking-tight text-fg-primary"
          />
          {count !== undefined && (
            <Badge variant="default" className="shrink-0 tabular-nums">
              {count}
            </Badge>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
