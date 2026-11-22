import { cn } from '@/utils/cn';
import { Avatar } from './avatar';
import { TruncatedText } from './truncated-text';

export interface UserChipProps {
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
}

export function UserChip({ displayName, avatarUrl, className }: UserChipProps) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-2 rounded-[2px] border border-border bg-subtle px-2 py-1 text-xs font-medium text-fg-primary',
        className
      )}
    >
      <Avatar src={avatarUrl} alt={displayName} size="sm" className="h-5 w-5 shrink-0" />
      <TruncatedText as="span" text={displayName} className="min-w-0 flex-1" />
    </div>
  );
}
