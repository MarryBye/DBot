import type { TranslateFn } from '@/i18n';
import type { TrackItem } from '@/types/api';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';

export interface QueueItemRowProps {
  track: TrackItem;
  index: number;
  totalCount: number;
  canControl: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  t: TranslateFn;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

export function QueueItemRow({
  track,
  index,
  totalCount,
  canControl,
  isDragging,
  isDragOver,
  t,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: QueueItemRowProps) {
  return (
    <div
      draggable={canControl}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'flex items-center gap-2.5 rounded-[2px] border border-border bg-surface px-2.5 py-2 transition-colors',
        canControl && 'hover:bg-subtle/60',
        isDragging && 'opacity-50',
        isDragOver && 'border-accent bg-accent-subtle/40'
      )}
    >
      <div className="flex items-center gap-1 text-fg-muted">
        {canControl && <Icon name="grip-vertical" size="xs" className="hidden cursor-grab sm:block" />}
        <span className="w-5 text-center text-xs font-semibold tabular-nums">{index + 1}</span>
      </div>

      <TrackThumbnail src={track.thumbnail} alt={track.title} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg-primary" title={track.title}>
          {track.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <PlatformBadge source={track.source} compact />
          <span className="max-w-[140px] truncate">{track.author}</span>
          <span>/</span>
          <span className="tabular-nums">{track.durationFormatted}</span>
          {track.requestedBy?.tag && (
            <>
              <span className="hidden sm:inline">/</span>
              <span className="hidden max-w-[110px] truncate sm:inline">
                {track.requestedBy.tag}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!canControl || index === 0}
          onClick={() => onMoveUp(index)}
          title={t('queue.moveUp')}
          aria-label={t('queue.moveUp')}
        >
          <Icon name="arrow-up" size="xs" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!canControl || index === totalCount - 1}
          onClick={() => onMoveDown(index)}
          title={t('queue.moveDown')}
          aria-label={t('queue.moveDown')}
        >
          <Icon name="arrow-down" size="xs" />
        </Button>
        <Button
          variant="danger-ghost"
          size="icon-sm"
          disabled={!canControl}
          onClick={() => onRemove(index)}
          title={t('queue.remove')}
          aria-label={t('queue.remove')}
        >
          <Icon name="x" size="xs" />
        </Button>
      </div>
    </div>
  );
}
