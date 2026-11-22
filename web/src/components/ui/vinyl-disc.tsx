import { cn } from '@/utils/cn';
import { safeColor, safeHttpUrl } from '@/utils/format';
import { Icon } from './icon';

export interface VinylDiscProps {
  thumbnailUrl?: string | null;
  accentColor: string;
  isPlaying: boolean;
  alt?: string;
  className?: string;
}

export function VinylDisc({
  thumbnailUrl,
  accentColor,
  isPlaying,
  alt = '',
  className,
}: VinylDiscProps) {
  const safeThumb = safeHttpUrl(thumbnailUrl);
  const ringColor = safeColor(accentColor);

  return (
    <div
      className={cn(
        'relative flex h-44 w-44 shrink-0 items-center justify-center rounded-full border-4 bg-subtle sm:h-52 sm:w-52',
        'animate-[spin_14s_linear_infinite]',
        !isPlaying && '[animation-play-state:paused]',
        className
      )}
      style={{ borderColor: ringColor }}
    >
      {/* Концентрические дорожки (плоский Metro-стиль без градиентов) */}
      <div className="pointer-events-none absolute inset-3 rounded-full border border-border-strong/60" />
      <div className="pointer-events-none absolute inset-6 rounded-full border border-border/80" />
      <div className="pointer-events-none absolute inset-9 rounded-full border border-border-strong/50" />

      {/* Обложка в центре */}
      <div
        className="relative z-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 bg-surface sm:h-24 sm:w-24"
        style={{ borderColor: ringColor }}
      >
        {safeThumb ? (
          <img src={safeThumb} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <Icon name="music" size="lg" className="text-fg-muted" />
        )}
        {/* Центральное отверстие диска */}
        <span
          className="absolute h-3.5 w-3.5 rounded-full border-2 bg-surface"
          style={{ borderColor: ringColor }}
        />
      </div>
    </div>
  );
}
