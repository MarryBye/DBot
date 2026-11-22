import { cn } from '@/utils/cn';
import { safeHttpUrl } from '@/utils/format';
import { Icon } from './icon';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const;

export function Avatar({ src, alt = '', size = 'md', className }: AvatarProps) {
  const safeSrc = safeHttpUrl(src);
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-border bg-subtle text-fg-muted',
        SIZE_CLASSES[size],
        className
      )}
    >
      {safeSrc ? (
        <img src={safeSrc} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <Icon name="user" size={size === 'sm' ? 'xs' : 'sm'} />
      )}
    </div>
  );
}
