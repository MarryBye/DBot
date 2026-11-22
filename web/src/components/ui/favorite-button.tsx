import { cn } from '@/utils/cn';
import { Button } from './button';
import { Icon } from './icon';

export interface FavoriteButtonProps {
  active: boolean;
  disabled?: boolean;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
  onToggle: () => void;
}

export function FavoriteButton({
  active,
  disabled = false,
  label,
  size = 'sm',
  className,
  onToggle,
}: FavoriteButtonProps) {
  return (
    <Button
      variant="ghost"
      size={size === 'sm' ? 'icon-sm' : 'icon'}
      disabled={disabled}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        active
          ? 'text-danger hover:bg-danger-subtle hover:text-danger'
          : 'text-fg-muted hover:text-danger',
        className
      )}
    >
      <Icon name="heart" size={size === 'sm' ? 'xs' : 'sm'} filled={active} />
    </Button>
  );
}
