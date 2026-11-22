import type { TranslateFn } from '@/i18n';
import type { ReactionVote } from '@/types/api';
import { safeColor } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { ReactionBar } from '@/components/ui/reaction-bar';
import { Tooltip, useHoverTooltip } from '@/components/ui/tooltip';
import { TruncatedText } from '@/components/ui/truncated-text';

export interface SoundTileReactions {
  likes: number;
  dislikes: number;
  myVote: ReactionVote;
  onVote: (value: 1 | -1) => void;
}

export interface SoundTileProps {
  name: string;
  meta: string;
  color: string;
  icon: IconName;
  inVoice: boolean;
  isBusy?: boolean;
  visibility?: 'public' | 'private';
  reactions?: SoundTileReactions;
  onEdit?: () => void;
  onTogglePublic?: () => void;
  secondaryActionIcon?: IconName;
  secondaryActionLabel?: string;
  secondaryActionDestructive?: boolean;
  secondaryActionDisabled?: boolean;
  t: TranslateFn;
  onPlay: () => void;
  onPreview: () => void;
  onSecondaryAction?: () => void;
}

export function SoundTile({
  name,
  meta,
  color,
  icon,
  inVoice,
  isBusy = false,
  visibility,
  reactions,
  onEdit,
  onTogglePublic,
  secondaryActionIcon,
  secondaryActionLabel,
  secondaryActionDestructive = false,
  secondaryActionDisabled = false,
  t,
  onPlay,
  onPreview,
  onSecondaryAction,
}: SoundTileProps) {
  const tileColor = safeColor(color);
  const playTooltipText = inVoice ? t('soundboard.playInVoice') : t('soundboard.joinVoiceFirst');
  const playTooltip = useHoverTooltip(playTooltipText);

  const menuItems: ContextMenuItem[] = [
    {
      id: 'play',
      label: t('ctx.playInVoice'),
      icon: 'volume-2',
      disabled: !inVoice || isBusy,
      onSelect: onPlay,
    },
    {
      id: 'preview',
      label: t('ctx.preview'),
      icon: 'headphones',
      onSelect: onPreview,
    },
    ...(onTogglePublic
      ? ([
          {
            id: 'visibility',
            label:
              visibility === 'public'
                ? t('soundboard.makePrivate')
                : t('soundboard.makePublic'),
            icon: visibility === 'public' ? 'lock' : 'globe',
            separatorBefore: true,
            onSelect: onTogglePublic,
          },
        ] satisfies ContextMenuItem[])
      : []),
    ...(onEdit
      ? ([
          {
            id: 'edit',
            label: t('soundboard.editSound'),
            icon: 'pencil',
            separatorBefore: !onTogglePublic,
            onSelect: onEdit,
          },
        ] satisfies ContextMenuItem[])
      : []),
    ...(secondaryActionIcon && secondaryActionLabel && onSecondaryAction
      ? ([
          {
            id: 'secondary',
            label: secondaryActionLabel,
            icon: secondaryActionIcon,
            disabled: secondaryActionDisabled,
            destructive: secondaryActionDestructive,
            separatorBefore: true,
            onSelect: onSecondaryAction,
          },
        ] satisfies ContextMenuItem[])
      : []),
  ];

  return (
    <ContextMenu items={menuItems} className="h-full">
      <div
        className="flex h-full min-w-0 flex-col overflow-hidden rounded-[2px] border border-border bg-surface transition-colors hover:border-border-strong"
        style={{ borderTopWidth: '3px', borderTopColor: tileColor }}
      >
        <button
          type="button"
          disabled={!inVoice || isBusy}
          onClick={onPlay}
          aria-label={playTooltipText}
          onMouseEnter={(e) => playTooltip.openFromElement(e.currentTarget)}
          onMouseLeave={playTooltip.close}
          onMouseDown={playTooltip.close}
          onFocus={(e) => playTooltip.openFromElement(e.currentTarget)}
          onBlur={playTooltip.close}
          className="flex min-w-0 flex-1 flex-col items-start gap-2.5 overflow-hidden p-3.5 text-left transition-colors hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55"
        >
          <div className="flex w-full items-start justify-between gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-white"
              style={{ backgroundColor: tileColor }}
            >
              <Icon name={icon} size="sm" />
            </div>
            {visibility && (
              <Badge variant={visibility === 'public' ? 'accent' : 'default'} className="shrink-0">
                <Icon name={visibility === 'public' ? 'globe' : 'lock'} size="xs" />
                <span>
                  {visibility === 'public'
                    ? t('playlists.badgePublic')
                    : t('playlists.badgePrivate')}
                </span>
              </Badge>
            )}
          </div>
          <TruncatedText
            text={name}
            lines={2}
            className="w-full text-sm font-semibold leading-snug text-fg-primary"
          />
        </button>
        <Tooltip
          content={playTooltipText}
          anchorRect={playTooltip.anchorRect}
          open={playTooltip.open}
        />

        {reactions && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
            <ReactionBar
              likes={reactions.likes}
              dislikes={reactions.dislikes}
              myVote={reactions.myVote}
              likeLabel={t('library.like')}
              dislikeLabel={t('library.dislike')}
              compact
              onVote={reactions.onVote}
            />
          </div>
        )}

        <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border bg-subtle/40 px-3 py-1.5">
          <TruncatedText text={meta} className="flex-1 text-[11px] text-fg-muted" />
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPreview}
              title={t('soundboard.preview')}
              aria-label={t('soundboard.preview')}
            >
              <Icon name="headphones" size="xs" />
            </Button>
            {onTogglePublic && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onTogglePublic}
                title={
                  visibility === 'public'
                    ? t('soundboard.makePrivate')
                    : t('soundboard.makePublic')
                }
                aria-label={
                  visibility === 'public'
                    ? t('soundboard.makePrivate')
                    : t('soundboard.makePublic')
                }
              >
                <Icon name={visibility === 'public' ? 'globe' : 'lock'} size="xs" />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                title={t('soundboard.editSound')}
                aria-label={t('soundboard.editSound')}
              >
                <Icon name="pencil" size="xs" />
              </Button>
            )}
            {secondaryActionIcon && secondaryActionLabel && onSecondaryAction && (
              <Button
                variant={secondaryActionDestructive ? 'danger-ghost' : 'ghost'}
                size="icon-sm"
                disabled={secondaryActionDisabled}
                onClick={onSecondaryAction}
                title={secondaryActionLabel}
                aria-label={secondaryActionLabel}
              >
                <Icon name={secondaryActionIcon} size="xs" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </ContextMenu>
  );
}
