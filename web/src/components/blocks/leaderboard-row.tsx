import type { TranslateFn } from '@/i18n';
import type { LeaderboardEntry, LeaderboardSortBy } from '@/types/api';
import { cn } from '@/utils/cn';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tooltip, useHoverTooltip } from '@/components/ui/tooltip';
import { TruncatedText } from '@/components/ui/truncated-text';

export function formatVoiceTime(seconds: number, t: TranslateFn): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  if (safe === 0) return t('leaderboard.timeZero');
  if (safe < 60) return t('leaderboard.timeLessMinute');
  const totalMinutes = Math.floor(safe / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return t('leaderboard.timeHoursMinutes', { h: hours, m: minutes });
  }
  return t('leaderboard.timeMinutes', { m: minutes });
}

interface TooltipSpanProps {
  tooltip?: string;
  className?: string;
  children: React.ReactNode;
}

function TooltipSpan({ tooltip, className, children }: TooltipSpanProps) {
  const { open, anchorRect, close, openFromElement } = useHoverTooltip(tooltip);

  return (
    <>
      <span
        className={className}
        onMouseEnter={(e) => openFromElement(e.currentTarget)}
        onMouseLeave={close}
        onMouseDown={close}
      >
        {children}
      </span>
      {tooltip && <Tooltip content={tooltip} anchorRect={anchorRect} open={open} />}
    </>
  );
}

interface MobileStatCellProps {
  icon: IconName;
  label: string;
  value: string | number;
  active: boolean;
  tooltip?: string;
}

function MobileStatCell({ icon, label, value, active, tooltip }: MobileStatCellProps) {
  return (
    <TooltipSpan
      tooltip={tooltip}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-[2px] border px-2 py-1.5',
        active
          ? 'border-accent/40 bg-accent-subtle/60 text-accent'
          : 'border-border bg-subtle/40 text-fg-secondary'
      )}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
        <Icon name={icon} size="xs" className="h-3 w-3" />
        <TruncatedText text={label} className="min-w-0" />
      </span>
      <span
        className={cn(
          'text-xs font-semibold tabular-nums',
          active ? 'text-accent' : 'text-fg-primary'
        )}
      >
        {value}
      </span>
    </TooltipSpan>
  );
}

export interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  activeSortBy: LeaderboardSortBy;
  canViewLogs: boolean;
  t: TranslateFn;
  onViewLogs: (userId: string) => void;
  onCopyText: (value: string) => void;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-warning/35 bg-warning-subtle text-warning-fg">
        <Icon name="crown" size="xs" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-border-strong bg-subtle text-fg-secondary">
        <Icon name="medal" size="xs" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-accent/35 bg-accent-subtle text-accent">
        <Icon name="medal" size="xs" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-xs font-semibold tabular-nums text-fg-muted">
      #{rank}
    </span>
  );
}

export function LeaderboardRow({
  entry,
  isCurrentUser,
  activeSortBy,
  canViewLogs,
  t,
  onViewLogs,
  onCopyText,
}: LeaderboardRowProps) {
  const voiceFormatted = formatVoiceTime(entry.voiceSeconds, t);
  const likesTooltip = t('leaderboard.likesBreakdown', {
    playlists: entry.playlistLikes,
    sounds: entry.soundLikes,
  });
  const scoreTooltip = t('leaderboard.scoreHint');

  const menuItems: ContextMenuItem[] = [
    ...(canViewLogs
      ? [
          {
            id: 'view-logs',
            label: t('leaderboard.ctxViewLogs'),
            icon: 'scroll-text' as const,
            onSelect: () => onViewLogs(entry.userId),
          },
        ]
      : []),
    {
      id: 'copy-username',
      label: t('leaderboard.ctxCopyUsername'),
      icon: 'copy',
      separatorBefore: canViewLogs,
      onSelect: () => onCopyText(`@${entry.username}`),
    },
    {
      id: 'copy-id',
      label: t('leaderboard.ctxCopyId'),
      icon: 'copy',
      onSelect: () => onCopyText(entry.userId),
    },
  ];

  const desktopMetricClass = (key: LeaderboardSortBy) =>
    cn(
      'hidden lg:flex items-center justify-end gap-1 text-xs tabular-nums',
      activeSortBy === key ? 'font-semibold text-accent' : 'text-fg-secondary'
    );

  return (
    <ContextMenu items={menuItems}>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-subtle/60',
          'lg:grid lg:grid-cols-[2.75rem_minmax(0,1.7fr)_repeat(6,minmax(0,0.72fr))] lg:items-center lg:gap-3',
          isCurrentUser && 'border-l-[3px] border-l-accent bg-accent-subtle/25'
        )}
      >
        {/* Rank + Member (grouped on mobile, separate grid cells on desktop via contents) */}
        <div className="flex min-w-0 items-center gap-2.5 lg:contents">
          <div className="flex items-center justify-center lg:justify-start">
            <RankBadge rank={entry.rank} />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
            <Avatar src={entry.avatarUrl} alt={entry.displayName} size="sm" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 items-center gap-1.5">
                <TruncatedText
                  text={entry.displayName}
                  className="text-xs font-semibold text-fg-primary"
                />
                {isCurrentUser && (
                  <Badge variant="accent" className="shrink-0">
                    {t('leaderboard.youBadge')}
                  </Badge>
                )}
                {entry.inVoiceNow && (
                  <TooltipSpan
                    tooltip={t('leaderboard.inVoiceNow')}
                    className="inline-flex shrink-0 items-center"
                  >
                    <span
                      className="h-2 w-2 rounded-[1px] bg-success"
                      aria-label={t('leaderboard.inVoiceNow')}
                    />
                  </TooltipSpan>
                )}
              </div>
              <TruncatedText
                text={`@${entry.username}`}
                as="div"
                className="text-[11px] text-fg-muted"
              />
            </div>
          </div>

          {/* Mobile right-hand primary score */}
          <div className="shrink-0 text-right lg:hidden">
            <div className="text-xs font-semibold tabular-nums text-accent">{entry.score}</div>
            <div className="text-[10px] uppercase tracking-wide text-fg-muted">
              {t('leaderboard.col.score')}
            </div>
          </div>
        </div>

        {/* Desktop numeric columns */}
        <div className={desktopMetricClass('voiceSeconds')}>
          <span>{voiceFormatted}</span>
        </div>

        <div className={desktopMetricClass('tracksAdded')}>
          <span>{entry.tracksAdded}</span>
        </div>

        <div className={desktopMetricClass('totalLikes')}>
          <TooltipSpan tooltip={likesTooltip} className="inline-flex items-center gap-1">
            <Icon name="thumbs-up" size="xs" className="h-3.5 w-3.5 opacity-75" />
            <span>{entry.totalLikes}</span>
          </TooltipSpan>
        </div>

        <div className={desktopMetricClass('sfxPlayed')}>
          <span>{entry.sfxPlayed}</span>
        </div>

        <div className={desktopMetricClass('skipsCount')}>
          <span>{entry.skipsCount}</span>
        </div>

        <div className={desktopMetricClass('score')}>
          <TooltipSpan tooltip={scoreTooltip} className="inline-flex items-center gap-1 font-semibold">
            <span>{entry.score}</span>
          </TooltipSpan>
        </div>

        {/* Mobile compact metrics grid */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-border/60 pt-2 sm:grid-cols-6 lg:hidden">
          <MobileStatCell
            icon="headphones"
            label={t('leaderboard.col.voiceTime')}
            value={voiceFormatted}
            active={activeSortBy === 'voiceSeconds'}
          />
          <MobileStatCell
            icon="music"
            label={t('leaderboard.col.tracks')}
            value={entry.tracksAdded}
            active={activeSortBy === 'tracksAdded'}
          />
          <MobileStatCell
            icon="thumbs-up"
            label={t('leaderboard.col.likes')}
            value={entry.totalLikes}
            active={activeSortBy === 'totalLikes'}
            tooltip={likesTooltip}
          />
          <MobileStatCell
            icon="volume-2"
            label={t('leaderboard.col.sfx')}
            value={entry.sfxPlayed}
            active={activeSortBy === 'sfxPlayed'}
          />
          <MobileStatCell
            icon="skip-forward"
            label={t('leaderboard.col.skips')}
            value={entry.skipsCount}
            active={activeSortBy === 'skipsCount'}
          />
          <MobileStatCell
            icon="flame"
            label={t('leaderboard.col.score')}
            value={entry.score}
            active={activeSortBy === 'score'}
            tooltip={scoreTooltip}
          />
        </div>
      </div>
    </ContextMenu>
  );
}
