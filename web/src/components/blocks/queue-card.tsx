import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { FavoriteTrackInput, TrackItem } from '@/types/api';
import { buildTrackKey } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { SectionHeader } from '@/components/ui/section-header';
import { QueueItemRow } from './queue-item-row';

const QUEUE_PAGE_SIZE = 8;

export interface QueueCardProps {
  tracks: TrackItem[];
  canControl: boolean;
  canSavePlaylist: boolean;
  isSavingPlaylist: boolean;
  favoriteTrackKeys: ReadonlySet<string>;
  playlistTrackKeys: ReadonlySet<string>;
  t: TranslateFn;
  onPlayTrackNow: (index: number) => void;
  onMoveTrack: (fromIndex: number, toIndex: number) => void;
  onRemoveTrack: (index: number) => void;
  onClearQueue: () => void;
  onRequestSavePlaylist: () => void;
  onToggleFavorite: (track: FavoriteTrackInput) => void;
  onAddToPlaylist: (track: FavoriteTrackInput) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function QueueCard({
  tracks,
  canControl,
  canSavePlaylist,
  isSavingPlaylist,
  favoriteTrackKeys,
  playlistTrackKeys,
  t,
  onPlayTrackNow,
  onMoveTrack,
  onRemoveTrack,
  onClearQueue,
  onRequestSavePlaylist,
  onToggleFavorite,
  onAddToPlaylist,
  onOpenLink,
  onCopyLink,
}: QueueCardProps) {
  const [dragFromIndex, setDragFromIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * QUEUE_PAGE_SIZE;
  const visibleTracks = tracks.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-3">
        <SectionHeader
          title={t('queue.title')}
          count={tracks.length}
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canSavePlaylist || isSavingPlaylist}
                onClick={onRequestSavePlaylist}
              >
                <Icon name="save" size="xs" />
                <span>{t('queue.save')}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canControl || tracks.length === 0}
                onClick={onClearQueue}
              >
                <Icon name="trash" size="xs" />
                <span>{t('queue.clear')}</span>
              </Button>
            </>
          }
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        {tracks.length === 0 ? (
          <EmptyState
            icon="list-music"
            title={t('queue.emptyTitle')}
            description={t('queue.emptyDescription')}
            compact
          />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {visibleTracks.map((track, localIdx) => {
                const globalIdx = pageStart + localIdx;
                return (
                  <QueueItemRow
                    key={`${track.id}-${globalIdx}`}
                    track={track}
                    index={globalIdx}
                    totalCount={tracks.length}
                    canControl={canControl}
                    isFavorite={favoriteTrackKeys.has(buildTrackKey(track))}
                    isInPlaylist={playlistTrackKeys.has(buildTrackKey(track))}
                    isDragging={dragFromIndex === globalIdx}
                    isDragOver={dragOverIndex === globalIdx && dragFromIndex !== globalIdx}
                    t={t}
                    onPlayNow={onPlayTrackNow}
                    onMoveToTop={(i) => onMoveTrack(i, 0)}
                    onMoveUp={(i) => onMoveTrack(i, i - 1)}
                    onMoveDown={(i) => onMoveTrack(i, i + 1)}
                    onRemove={onRemoveTrack}
                    onToggleFavorite={onToggleFavorite}
                    onAddToPlaylist={onAddToPlaylist}
                    onOpenLink={onOpenLink}
                    onCopyLink={onCopyLink}
                    onDragStart={setDragFromIndex}
                    onDragOver={setDragOverIndex}
                    onDrop={(toIdx) => {
                      if (dragFromIndex !== null && dragFromIndex !== toIdx) {
                        onMoveTrack(dragFromIndex, toIdx);
                      }
                      setDragFromIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragFromIndex(null);
                      setDragOverIndex(null);
                    }}
                  />
                );
              })}
            </div>

            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                hasPrev={page > 1}
                hasNext={page < totalPages}
                t={t}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
