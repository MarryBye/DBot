import type { ReactionVote } from '@/types/api';
import { cn } from '@/utils/cn';
import { Button } from './button';
import { Icon } from './icon';

export interface ReactionBarProps {
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
  disabled?: boolean;
  likeLabel: string;
  dislikeLabel: string;
  compact?: boolean;
  className?: string;
  onVote: (value: 1 | -1) => void;
}

export function ReactionBar({
  likes,
  dislikes,
  myVote,
  disabled = false,
  likeLabel,
  dislikeLabel,
  compact = false,
  className,
  onVote,
}: ReactionBarProps) {
  const sizeClass = compact ? 'h-6 gap-1 px-1.5 text-[11px]' : 'h-7 gap-1 px-2 text-xs';

  return (
    <div className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-pressed={myVote === 1}
        aria-label={likeLabel}
        title={likeLabel}
        onClick={() => onVote(1)}
        className={cn(
          'tabular-nums',
          sizeClass,
          myVote === 1
            ? 'border-success bg-success-subtle text-success-fg hover:bg-success-subtle'
            : 'border-border bg-surface text-fg-secondary hover:border-border-strong hover:bg-subtle hover:text-fg-primary'
        )}
      >
        <Icon name="thumbs-up" size="xs" filled={myVote === 1} />
        <span>{likes}</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-pressed={myVote === -1}
        aria-label={dislikeLabel}
        title={dislikeLabel}
        onClick={() => onVote(-1)}
        className={cn(
          'tabular-nums',
          sizeClass,
          myVote === -1
            ? 'border-danger bg-danger-subtle text-danger-fg hover:bg-danger-subtle'
            : 'border-border bg-surface text-fg-secondary hover:border-border-strong hover:bg-subtle hover:text-fg-primary'
        )}
      >
        <Icon name="thumbs-down" size="xs" filled={myVote === -1} />
        <span>{dislikes}</span>
      </Button>
    </div>
  );
}
