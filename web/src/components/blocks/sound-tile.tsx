import type { TranslateFn } from '@/i18n';
import { safeColor } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { TruncatedText } from '@/components/ui/truncated-text';

export interface SoundTileProps {
  name: string;
  meta: string;
  color: string;
  icon: IconName;
  inVoice: boolean;
  isBusy?: boolean;
  secondaryActionIcon: IconName;
  secondaryActionLabel: string;
  secondaryActionDestructive?: boolean;
  secondaryActionDisabled?: boolean;
  t: TranslateFn;
  onPlay: () => void;
  onPreview: () => void;
  onSecondaryAction: () => void;
}

export function SoundTile({
  name,
  meta,
  color,
  icon,
  inVoice,
  isBusy = false,
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
    {
      id: 'secondary',
      label: secondaryActionLabel,
      icon: secondaryActionIcon,
      disabled: secondaryActionDisabled,
      destructive: secondaryActionDestructive,
      separatorBefore: true,
      onSelect: onSecondaryAction,
    },
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
          title={inVoice ? t('soundboard.playInVoice') : t('soundboard.joinVoiceFirst')}
          className="flex min-w-0 flex-1 flex-col items-start gap-2.5 overflow-hidden p-3.5 text-left transition-colors hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55"
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-white"
            style={{ backgroundColor: tileColor }}
          >
            <Icon name={icon} size="sm" />
          </div>
          <TruncatedText
            text={name}
            lines={2}
            className="w-full text-sm font-semibold leading-snug text-fg-primary"
          />
        </button>

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
          </div>
        </div>
      </div>
    </ContextMenu>
  );
}
