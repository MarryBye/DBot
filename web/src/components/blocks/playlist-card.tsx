import * as React from 'react';
import { formatDateTime, type Locale, type TranslateFn } from '@/i18n';
import type { UserPlaylist } from '@/types/api';
import { formatDuration, safeHttpUrl } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TruncatedText } from '@/components/ui/truncated-text';

const TRACKS_PAGE_SIZE = 8;

export interface PlaylistCardProps {
  playlist: UserPlaylist;
  inVoice: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  locale: Locale;
  t: TranslateFn;
  onLoad: (playlist: UserPlaylist) => void;
  onToggleExpand: (id: number) => void;
  onDelete: (playlist: UserPlaylist) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function PlaylistCard({
  playlist,
  inVoice,
  isExpanded,
  isLoading,
  locale,
  t,
  onLoad,
  onToggleExpand,
  onDelete,
  onOpenLink,
  onCopyLink,
}: PlaylistCardProps) {
  const [tracksPage, setTracksPage] = React.useState(1);
  const totalTrackPages = Math.max(1, Math.ceil(playlist.tracks.length / TRACKS_PAGE_SIZE));

  React.useEffect(() => {
    if (tracksPage > totalTrackPages) {
      setTracksPage(totalTrackPages);
    }
  }, [tracksPage, totalTrackPages]);

  const totalSec = playlist.tracks.reduce((acc, item) => acc + (Number(item.durationSec) || 0), 0);
  const updatedStr = playlist.updatedAt ? formatDateTime(locale, playlist.updatedAt) : '';

  const pageStart = (tracksPage - 1) * TRACKS_PAGE_SIZE;
  const visibleTracks = playlist.tracks.slice(pageStart, pageStart + TRACKS_PAGE_SIZE);

  const cardMenuItems: ContextMenuItem[] = [
    {
      id: 'load',
      label: t('playlists.load'),
      icon: 'plus',
      disabled: !inVoice || isLoading,
      onSelect: () => onLoad(playlist),
    },
    {
      id: 'toggle',
      label: isExpanded ? t('playlists.hideTracks') : t('playlists.showTracks'),
      icon: isExpanded ? 'chevron-up' : 'chevron-down',
      onSelect: () => onToggleExpand(playlist.id),
    },
    {
      id: 'delete',
      label: t('playlists.delete'),
      icon: 'trash',
      destructive: true,
      separatorBefore: true,
      onSelect: () => onDelete(playlist),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <ContextMenu items={cardMenuItems}>
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="list-music" size="sm" className="text-accent" />
              <TruncatedText
                text={playlist.name}
                as="h3"
                className="flex-1 text-sm font-semibold text-fg-primary"
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
              <span className="font-medium text-fg-secondary">
                {t('playlists.tracksCount', { count: playlist.trackCount })}
              </span>
              {totalSec > 0 && (
                <>
                  <span>/</span>
                  <span className="tabular-nums">{formatDuration(totalSec)}</span>
                </>
              )}
              {updatedStr && (
                <>
                  <span>/</span>
                  <span>{t('playlists.updatedAt', { date: updatedStr })}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="primary"
              size="sm"
              disabled={!inVoice || isLoading}
              onClick={() => onLoad(playlist)}
              title={inVoice ? t('playlists.load') : t('soundboard.joinVoiceFirst')}
            >
              <Icon name="plus" size="xs" />
              <span>{isLoading ? t('playlists.loading') : t('playlists.load')}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleExpand(playlist.id)}
            >
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="xs" />
              <span>{isExpanded ? t('playlists.hideTracks') : t('playlists.showTracks')}</span>
            </Button>
            <Button
              variant="danger-ghost"
              size="icon"
              onClick={() => onDelete(playlist)}
              title={t('playlists.delete')}
              aria-label={t('playlists.delete')}
            >
              <Icon name="trash" size="xs" />
            </Button>
          </div>
        </div>
      </ContextMenu>

      {isExpanded && (
        <div className="space-y-2 border-t border-border bg-subtle/40 px-4 py-2.5">
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
                <ContextMenu key={`${track.id}-${globalIdx}`} items={trackMenu}>
                  <div className="flex min-w-0 items-center gap-2.5 overflow-hidden py-2 text-xs">
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
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {track.durationFormatted || '0:00'}
                    </span>
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
