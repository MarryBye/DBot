import type { TrackSource } from '@/types/api';
import { cn } from '@/utils/cn';

const SOURCE_META: Record<TrackSource, { label: string; dotClass: string }> = {
  youtube: { label: 'YouTube', dotClass: 'bg-platform-youtube' },
  soundcloud: { label: 'SoundCloud', dotClass: 'bg-platform-soundcloud' },
  spotify: { label: 'Spotify', dotClass: 'bg-platform-spotify' },
};

export interface PlatformBadgeProps {
  source: TrackSource;
  compact?: boolean;
  className?: string;
}

export function PlatformBadge({ source, compact = false, className }: PlatformBadgeProps) {
  const meta = SOURCE_META[source] ?? SOURCE_META.youtube;

  if (compact) {
    return (
      <span
        title={meta.label}
        aria-label={meta.label}
        className={cn('inline-block h-2 w-2 shrink-0 rounded-[1px]', meta.dotClass, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border border-border bg-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-fg-secondary',
        className
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-[1px]', meta.dotClass)} />
      {meta.label}
    </span>
  );
}
