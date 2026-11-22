import * as React from 'react';
import { formatDateTime, type Locale, type TranslateFn } from '@/i18n';
import type { UserPlaylist } from '@/types/api';
import { formatDuration, safeHttpUrl } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';

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

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="list-music" size="sm" className="text-accent" />
            <h3 className="truncate text-sm font-semibold text-fg-primary">{playlist.name}</h3>
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

        <div className="flex flex-wrap items-center gap-1.5">
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

      {isExpanded && (
        <div className="space-y-2 border-t border-border bg-subtle/40 px-4 py-2.5">
          <div className="flex flex-col divide-y divide-border">
            {visibleTracks.map((track, localIdx) => {
              const globalIdx = pageStart + localIdx;
              const href = safeHttpUrl(track.originalUrl);
              return (
                <div
                  key={`${track.id}-${globalIdx}`}
                  className="flex items-center gap-2.5 py-2 text-xs"
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-fg-muted">
                    {globalIdx + 1}.
                  </span>
                  <PlatformBadge source={track.source} compact />
                  <div className="min-w-0 flex-1 truncate">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-fg-primary hover:text-accent hover:underline"
                      >
                        {track.title}
                      </a>
                    ) : (
                      <span className="font-medium text-fg-primary">{track.title}</span>
                    )}
                    {track.author && (
                      <span className="text-fg-muted"> — {track.author}</span>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums text-fg-muted">
                    {track.durationFormatted || '0:00'}
                  </span>
                </div>
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
