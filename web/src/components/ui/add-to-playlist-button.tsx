import { cn } from '@/utils/cn';
import { Button } from './button';
import { Icon } from './icon';

export interface AddToPlaylistButtonProps {
  active?: boolean;
  disabled?: boolean;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
  onClick: () => void;
}

export function AddToPlaylistButton({
  active = false,
  disabled = false,
  label,
  size = 'sm',
  className,
  onClick,
}: AddToPlaylistButtonProps) {
  return (
    <Button
      variant="ghost"
      size={size === 'sm' ? 'icon-sm' : 'icon'}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        active
          ? 'bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent'
          : 'text-fg-muted hover:text-accent',
        className
      )}
    >
      <Icon
        name={active ? 'list-checks' : 'list-plus'}
        size={size === 'sm' ? 'xs' : 'sm'}
        strokeWidth={active ? 2.25 : 1.85}
      />
    </Button>
  );
}
