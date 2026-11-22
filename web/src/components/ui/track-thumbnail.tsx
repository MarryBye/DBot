import { cn } from '@/utils/cn';
import { safeHttpUrl } from '@/utils/format';
import { Icon, type IconName, type IconSize } from './icon';

const SIZE_CLASSES = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
} as const;

const ICON_SIZES: Record<keyof typeof SIZE_CLASSES, IconSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'xl',
};

export interface TrackThumbnailProps {
  src?: string | null;
  alt?: string;
  size?: keyof typeof SIZE_CLASSES;
  fallbackIcon?: IconName;
  className?: string;
}

export function TrackThumbnail({
  src,
  alt = '',
  size = 'sm',
  fallbackIcon = 'music',
  className,
}: TrackThumbnailProps) {
  const safeSrc = safeHttpUrl(src);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-border bg-subtle text-fg-muted',
        SIZE_CLASSES[size],
        className
      )}
    >
      {safeSrc ? (
        <img src={safeSrc} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <Icon name={fallbackIcon} size={ICON_SIZES[size]} />
      )}
    </div>
  );
}
