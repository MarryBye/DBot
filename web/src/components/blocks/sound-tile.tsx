import type { TranslateFn } from '@/i18n';
import { safeColor } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';

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

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[2px] border border-border bg-surface transition-colors hover:border-border-strong"
      style={{ borderTopWidth: '3px', borderTopColor: tileColor }}
    >
      <button
        type="button"
        disabled={!inVoice || isBusy}
        onClick={onPlay}
        title={inVoice ? t('soundboard.playInVoice') : t('soundboard.joinVoiceFirst')}
        className="flex flex-1 flex-col items-start gap-2.5 p-3.5 text-left transition-colors hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[2px] text-white"
          style={{ backgroundColor: tileColor }}
        >
          <Icon name={icon} size="sm" />
        </div>
        <span className="line-clamp-2 w-full text-sm font-semibold leading-snug text-fg-primary">
          {name}
        </span>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-subtle/40 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">{meta}</span>
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
  );
}
