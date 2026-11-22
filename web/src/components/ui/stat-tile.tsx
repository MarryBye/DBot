import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';
import { TruncatedText } from './truncated-text';

export type StatTileAccent = 'default' | 'accent' | 'success' | 'warning';

export interface StatTileProps {
  icon: IconName;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: StatTileAccent;
  className?: string;
}

const ACCENT_ICON_CLASS: Record<StatTileAccent, string> = {
  default: 'text-fg-secondary bg-subtle',
  accent: 'text-accent bg-accent-subtle',
  success: 'text-success-fg bg-success-subtle',
  warning: 'text-warning-fg bg-warning-subtle',
};

export function StatTile({
  icon,
  label,
  value,
  sublabel,
  accent = 'default',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-[2px] border border-border bg-surface px-3.5 py-2.5',
        className
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px]',
          ACCENT_ICON_CLASS[accent]
        )}
      >
        <Icon name={icon} size="sm" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <TruncatedText
          text={label}
          as="div"
          className="text-[11px] font-medium uppercase tracking-wide text-fg-muted"
        />
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          <span className="text-base font-semibold tabular-nums text-fg-primary">{value}</span>
          {sublabel && (
            <TruncatedText text={sublabel} className="min-w-0 text-[11px] text-fg-muted" />
          )}
        </div>
      </div>
    </div>
  );
}
