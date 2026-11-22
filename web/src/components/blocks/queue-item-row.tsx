import type { TranslateFn } from '@/i18n';
import type { TrackItem } from '@/types/api';
import { cn } from '@/utils/cn';
import { safeHttpUrl } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';
import { TruncatedText } from '@/components/ui/truncated-text';

export interface QueueItemRowProps {
  track: TrackItem;
  index: number;
  totalCount: number;
  canControl: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  t: TranslateFn;
  onPlayNow: (index: number) => void;
  onMoveToTop: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
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
  onPlayNow,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onRemove,
  onOpenLink,
  onCopyLink,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: QueueItemRowProps) {
  const safeLink = safeHttpUrl(track.originalUrl || track.url);
  const titleText = track.title || track.originalUrl;

  const menuItems: ContextMenuItem[] = [
    {
      id: 'play-now',
      label: t('ctx.playNow'),
      icon: 'play',
      disabled: !canControl,
      onSelect: () => onPlayNow(index),
    },
    {
      id: 'move-top',
      label: t('ctx.moveToTop'),
      icon: 'arrow-up-to-line',
      disabled: !canControl || index === 0,
      onSelect: () => onMoveToTop(index),
    },
    {
      id: 'move-up',
      label: t('ctx.moveUp'),
      icon: 'arrow-up',
      disabled: !canControl || index === 0,
      onSelect: () => onMoveUp(index),
    },
    {
      id: 'move-down',
      label: t('ctx.moveDown'),
      icon: 'arrow-down',
      disabled: !canControl || index === totalCount - 1,
      onSelect: () => onMoveDown(index),
    },
    ...(safeLink
      ? [
          {
            id: 'open-link',
            label: t('ctx.openLink'),
            icon: 'external-link' as const,
            separatorBefore: true,
            onSelect: () => onOpenLink(safeLink),
          },
          {
            id: 'copy-link',
            label: t('ctx.copyLink'),
            icon: 'copy' as const,
            onSelect: () => onCopyLink(safeLink),
          },
        ]
      : []),
    {
      id: 'remove',
      label: t('ctx.remove'),
      icon: 'trash',
      disabled: !canControl,
      destructive: true,
      separatorBefore: true,
      onSelect: () => onRemove(index),
    },
  ];

  return (
    <ContextMenu items={menuItems}>
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
          'flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[2px] border border-border bg-surface px-2.5 py-2 transition-colors',
          canControl && 'hover:bg-subtle/60',
          isDragging && 'opacity-50',
          isDragOver && 'border-accent bg-accent-subtle/40'
        )}
      >
        <div className="flex shrink-0 items-center gap-1 text-fg-muted">
          {canControl && <Icon name="grip-vertical" size="xs" className="hidden cursor-grab sm:block" />}
          <span className="w-5 text-center text-xs font-semibold tabular-nums">{index + 1}</span>
        </div>

        <TrackThumbnail src={track.thumbnail} alt={titleText} size="sm" />

        <div className="min-w-0 flex-1 overflow-hidden">
          <TruncatedText
            text={titleText}
            as="div"
            className="text-sm font-medium text-fg-primary"
          />
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <PlatformBadge source={track.source} compact />
            <TruncatedText text={track.author} className="max-w-[140px] shrink" />
            <span className="shrink-0">/</span>
            <span className="shrink-0 tabular-nums">{track.durationFormatted}</span>
            {track.requestedBy?.tag && (
              <>
                <span className="hidden shrink-0 sm:inline">/</span>
                <TruncatedText
                  text={track.requestedBy.tag}
                  className="hidden max-w-[110px] shrink sm:block"
                />
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
    </ContextMenu>
  );
}
