import * as React from 'react';
import { formatDateTime, type Locale, type TextCode, type TranslateFn } from '@/i18n';
import type { AuditLogAction, AuditLogEntry } from '@/types/api';
import { cn } from '@/utils/cn';
import { safeHttpUrl } from '@/utils/format';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TruncatedText } from '@/components/ui/truncated-text';

const LOG_TRACKS_PAGE_SIZE = 6;

interface ActionVisualSpec {
  icon: IconName;
  badgeVariant: NonNullable<BadgeProps['variant']>;
  borderClass: string;
  labelCode: TextCode;
}

const ACTION_VISUALS: Record<AuditLogAction, ActionVisualSpec> = {
  summon: {
    icon: 'mic',
    badgeVariant: 'accent',
    borderClass: 'border-l-accent',
    labelCode: 'logs.action.summon',
  },
  add_tracks: {
    icon: 'plus',
    badgeVariant: 'success',
    borderClass: 'border-l-success',
    labelCode: 'logs.action.add_tracks',
  },
  remove_tracks: {
    icon: 'trash',
    badgeVariant: 'warning',
    borderClass: 'border-l-warning',
    labelCode: 'logs.action.remove_tracks',
  },
  play_now: {
    icon: 'play',
    badgeVariant: 'accent',
    borderClass: 'border-l-accent',
    labelCode: 'logs.action.play_now',
  },
  skip: {
    icon: 'skip-forward',
    badgeVariant: 'warning',
    borderClass: 'border-l-warning',
    labelCode: 'logs.action.skip',
  },
  clear_queue: {
    icon: 'trash',
    badgeVariant: 'danger',
    borderClass: 'border-l-danger',
    labelCode: 'logs.action.clear_queue',
  },
  stop: {
    icon: 'square',
    badgeVariant: 'danger',
    borderClass: 'border-l-danger',
    labelCode: 'logs.action.stop',
  },
  loop: {
    icon: 'repeat',
    badgeVariant: 'accent',
    borderClass: 'border-l-accent',
    labelCode: 'logs.action.loop',
  },
  shuffle: {
    icon: 'shuffle',
    badgeVariant: 'default',
    borderClass: 'border-l-border-strong',
    labelCode: 'logs.action.shuffle',
  },
  pause: {
    icon: 'pause',
    badgeVariant: 'default',
    borderClass: 'border-l-border-strong',
    labelCode: 'logs.action.pause',
  },
  resume: {
    icon: 'play',
    badgeVariant: 'success',
    borderClass: 'border-l-success',
    labelCode: 'logs.action.resume',
  },
  settings_update: {
    icon: 'settings',
    badgeVariant: 'accent',
    borderClass: 'border-l-accent',
    labelCode: 'logs.action.settings_update',
  },
  cookies_update: {
    icon: 'cookie',
    badgeVariant: 'warning',
    borderClass: 'border-l-warning',
    labelCode: 'logs.action.cookies_update',
  },
};

function buildSummary(entry: AuditLogEntry, t: TranslateFn): string {
  const count = entry.trackCount || entry.tracks.length;

  switch (entry.action) {
    case 'summon':
      return t('logs.summary.summon');
    case 'add_tracks':
      if (entry.details?.playlistName) {
        return t('logs.summary.addPlaylist', {
          name: entry.details.playlistName,
          count,
        });
      }
      return count > 1
        ? t('logs.summary.addMany', { count })
        : t('logs.summary.addOne');
    case 'remove_tracks':
      return count > 1
        ? t('logs.summary.removeMany', { count })
        : t('logs.summary.removeOne');
    case 'play_now':
      return t('logs.summary.playNow');
    case 'skip':
      return count > 1
        ? t('logs.summary.skipMany', { count })
        : t('logs.summary.skipOne');
    case 'clear_queue':
      return t('logs.summary.clearQueue', { count });
    case 'stop':
      return count > 0
        ? t('logs.summary.stopWithTracks', { count })
        : t('logs.summary.stopEmpty');
    case 'loop': {
      const mode = entry.details?.loopMode;
      const modeLabel =
        mode === 'track'
          ? t('player.loopTrack')
          : mode === 'queue'
            ? t('player.loopQueue')
            : t('player.loopOff');
      return t('logs.summary.loop', { mode: modeLabel });
    }
    case 'shuffle':
      return t('logs.summary.shuffle', { count: entry.details?.count ?? 0 });
    case 'pause':
      return t('logs.summary.pause');
    case 'resume':
      return t('logs.summary.resume');
    case 'settings_update': {
      const role = entry.details?.requiredRoleName || t('admin.roleEveryone');
      const channel = entry.details?.allowedChannelName
        ? `#${entry.details.allowedChannelName}`
        : t('admin.channelAll');
      const logsAccess = entry.details?.logsAdminOnly
        ? t('logs.accessAdmins')
        : t('logs.accessAll');
      return t('logs.summary.settingsUpdate', { role, channel, logsAccess });
    }
    case 'cookies_update': {
      const op = entry.details?.cookiesOp;
      if (op === 'reloaded') {
        return t('logs.summary.cookiesReloaded', {
          count: entry.details?.cookiesLineCount ?? 0,
        });
      }
      if (op === 'cleared') {
        return t('logs.summary.cookiesCleared');
      }
      return t('logs.summary.cookiesUploaded', {
        count: entry.details?.cookiesLineCount ?? 0,
      });
    }
  }
}

export interface LogEntryCardProps {
  entry: AuditLogEntry;
  isExpanded: boolean;
  locale: Locale;
  t: TranslateFn;
  onToggleExpand: (id: number) => void;
  onFilterByActor: (actorId: string) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
  onCopyText: (value: string) => void;
}

export function LogEntryCard({
  entry,
  isExpanded,
  locale,
  t,
  onToggleExpand,
  onFilterByActor,
  onOpenLink,
  onCopyLink,
  onCopyText,
}: LogEntryCardProps) {
  const [tracksPage, setTracksPage] = React.useState(1);

  const spec = ACTION_VISUALS[entry.action];
  const hasTracks = entry.tracks.length > 0;
  const totalTrackPages = Math.max(1, Math.ceil(entry.tracks.length / LOG_TRACKS_PAGE_SIZE));

  React.useEffect(() => {
    if (tracksPage > totalTrackPages) {
      setTracksPage(totalTrackPages);
    }
  }, [tracksPage, totalTrackPages]);

  const pageStart = (tracksPage - 1) * LOG_TRACKS_PAGE_SIZE;
  const visibleTracks = entry.tracks.slice(pageStart, pageStart + LOG_TRACKS_PAGE_SIZE);
  const summary = buildSummary(entry, t);

  const cardMenuItems: ContextMenuItem[] = [
    {
      id: 'filter-actor',
      label: t('logs.filterByUser'),
      icon: 'filter',
      onSelect: () => onFilterByActor(entry.actorId),
    },
    {
      id: 'copy-username',
      label: t('logs.copyUsername'),
      icon: 'copy',
      onSelect: () => onCopyText(`@${entry.actorUsername}`),
    },
    {
      id: 'copy-userid',
      label: t('logs.copyUserId'),
      icon: 'user',
      onSelect: () => onCopyText(entry.actorId),
    },
    ...(hasTracks
      ? ([
          {
            id: 'toggle-tracks',
            label: isExpanded
              ? t('logs.hideTracks')
              : t('logs.showTracks', { count: entry.trackCount || entry.tracks.length }),
            icon: isExpanded ? 'chevron-up' : 'chevron-down',
            separatorBefore: true,
            onSelect: () => onToggleExpand(entry.id),
          },
        ] satisfies ContextMenuItem[])
      : []),
  ];

  return (
    <Card className={cn('overflow-hidden border-l-[3px]', spec.borderClass)}>
      <ContextMenu items={cardMenuItems}>
        <div className="space-y-2.5 p-3.5">
          {/* Row 1: Action badge + Real Discord identity + Timestamp & context */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant={spec.badgeVariant} className="shrink-0">
                <Icon name={spec.icon} size="xs" />
                <span>{t(spec.labelCode)}</span>
              </Badge>

              <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
                <Avatar
                  src={entry.actorAvatarUrl}
                  alt={entry.actorDisplayName}
                  size="sm"
                  className="h-5 w-5 shrink-0"
                />
                <TruncatedText
                  text={entry.actorDisplayName}
                  className="max-w-[160px] text-xs font-semibold text-fg-primary"
                />
                <button
                  type="button"
                  onClick={() => onFilterByActor(entry.actorId)}
                  className="inline-flex min-w-0 max-w-[170px] items-center rounded-[2px] border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary transition-colors hover:border-border-strong hover:text-fg-primary"
                >
                  <TruncatedText text={`@${entry.actorUsername}`} />
                </button>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
              {entry.channelName && (
                <Badge variant="default" className="max-w-[160px] normal-case tracking-normal">
                  <Icon name="volume-2" size="xs" />
                  <TruncatedText text={entry.channelName} />
                </Badge>
              )}
              {entry.workerId !== null && (
                <Badge variant="outline" className="tabular-nums">
                  #{entry.workerId}
                </Badge>
              )}
              <Badge variant="outline" className="normal-case tracking-normal">
                <Icon
                  name={entry.source === 'discord' ? 'message-square' : 'monitor'}
                  size="xs"
                />
                <span>
                  {entry.source === 'discord' ? t('logs.sourceDiscord') : t('logs.sourceWeb')}
                </span>
              </Badge>
              <span className="tabular-nums text-fg-muted">
                {formatDateTime(locale, entry.updatedAt)}
              </span>
            </div>
          </div>

          {/* Row 2: Action summary + Expandable tracks dropdown trigger */}
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-sm font-medium text-fg-primary [overflow-wrap:anywhere]">
                {summary}
              </p>
            </div>

            {hasTracks && (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                onClick={() => {
                  onToggleExpand(entry.id);
                  setTracksPage(1);
                }}
              >
                <Icon name="list-music" size="xs" />
                <span>
                  {isExpanded
                    ? t('logs.hideTracks')
                    : t('logs.showTracks', { count: entry.trackCount || entry.tracks.length })}
                </span>
                <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="xs" />
              </Button>
            )}
          </div>
        </div>
      </ContextMenu>

      {/* Expandable paginated tracks list */}
      {isExpanded && hasTracks && (
        <div className="space-y-2 border-t border-border bg-subtle/40 px-3.5 py-2.5">
          <div className="flex min-w-0 flex-col divide-y divide-border">
            {visibleTracks.map((track, localIdx) => {
              const globalIdx = pageStart + localIdx;
              const href = safeHttpUrl(track.originalUrl);
              const fullLabel = track.author ? `${track.title} — ${track.author}` : track.title;
              const trackMenu: ContextMenuItem[] = href
                ? [
                    {
                      id: 'open',
                      label: t('ctx.openLink'),
                      icon: 'external-link',
                      onSelect: () => onOpenLink(href),
                    },
                    {
                      id: 'copy',
                      label: t('ctx.copyLink'),
                      icon: 'copy',
                      onSelect: () => onCopyLink(href),
                    },
                  ]
                : [];

              return (
                <ContextMenu
                  key={`${track.id}-${globalIdx}`}
                  items={trackMenu}
                  className="py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5 overflow-hidden text-xs">
                    <span className="w-6 shrink-0 text-right tabular-nums text-fg-muted">
                      {globalIdx + 1}.
                    </span>
                    <PlatformBadge source={track.source} compact />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block min-w-0 font-medium text-fg-primary hover:text-accent hover:underline"
                        >
                          <TruncatedText text={fullLabel} />
                        </a>
                      ) : (
                        <TruncatedText text={fullLabel} className="font-medium text-fg-primary" />
                      )}
                    </div>
                    {track.durationFormatted && (
                      <span className="shrink-0 tabular-nums text-fg-muted">
                        {track.durationFormatted}
                      </span>
                    )}
                  </div>
                </ContextMenu>
              );
            })}
          </div>

          {totalTrackPages > 1 && (
            <Pagination
              page={tracksPage}
              totalPages={totalTrackPages}
              hasPrev={tracksPage > 1}
              hasNext={tracksPage < totalTrackPages}
              t={t}
              onPrev={() => setTracksPage((p) => Math.max(1, p - 1))}
              onNext={() => setTracksPage((p) => Math.min(totalTrackPages, p + 1))}
            />
          )}
        </div>
      )}
    </Card>
  );
}
