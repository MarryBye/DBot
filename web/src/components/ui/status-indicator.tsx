import { cn } from '@/utils/cn';

export type IndicatorTone = 'online' | 'offline' | 'busy' | 'warning' | 'danger';

const TONE_DOT: Record<IndicatorTone, string> = {
  online: 'bg-success',
  busy: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
  offline: 'bg-fg-muted',
};

export interface StatusIndicatorProps {
  tone: IndicatorTone;
  label: string;
  className?: string;
}

export function StatusIndicator({ tone, label, className }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium text-fg-primary', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-[1px]', TONE_DOT[tone])} />
      <span className="truncate">{label}</span>
    </span>
  );
}
