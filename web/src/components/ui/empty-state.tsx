import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center justify-center overflow-hidden text-center border border-dashed border-border bg-subtle/40 rounded-[2px]',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        className
      )}
    >
      <div className="mb-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-border bg-surface text-fg-muted">
        <Icon name={icon} size="md" />
      </div>
      <p className="max-w-full text-sm font-medium text-fg-primary [overflow-wrap:anywhere]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted [overflow-wrap:anywhere]">{description}</p>
      )}
    </div>
  );
}
