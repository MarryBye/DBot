import * as React from 'react';
import type { Locale, TranslateFn } from '@/i18n';
import type { UserPlaylist } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SectionHeader } from '@/components/ui/section-header';
import { PlaylistCard } from './playlist-card';

const PLAYLISTS_PAGE_SIZE = 6;

export interface PlaylistsSectionProps {
  playlists: UserPlaylist[];
  inVoice: boolean;
  canSaveQueue: boolean;
  isSaving: boolean;
  loadingPlaylistId: number | null;
  expandedIds: ReadonlySet<number>;
  locale: Locale;
  t: TranslateFn;
  onSaveQueue: (name: string) => void;
  onLoadPlaylist: (playlist: UserPlaylist) => void;
  onDeletePlaylist: (playlist: UserPlaylist) => void;
  onToggleExpand: (id: number) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function PlaylistsSection({
  playlists,
  inVoice,
  canSaveQueue,
  isSaving,
  loadingPlaylistId,
  expandedIds,
  locale,
  t,
  onSaveQueue,
  onLoadPlaylist,
  onDeletePlaylist,
  onToggleExpand,
  onOpenLink,
  onCopyLink,
}: PlaylistsSectionProps) {
  const [name, setName] = React.useState('');
  const [page, setPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(playlists.length / PLAYLISTS_PAGE_SIZE));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PLAYLISTS_PAGE_SIZE;
  const visiblePlaylists = playlists.slice(pageStart, pageStart + PLAYLISTS_PAGE_SIZE);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveQueue(trimmed);
    setName('');
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <SectionHeader
          title={t('playlists.title')}
          count={playlists.length}
          description={t('playlists.description')}
        />
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            maxLength={60}
            disabled={!canSaveQueue || isSaving}
            placeholder={t('playlists.savePlaceholder')}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={!canSaveQueue || isSaving || !name.trim()}
            className="shrink-0"
          >
            <Icon name="save" size="sm" />
            <span>{isSaving ? t('playlists.saving') : t('playlists.saveButton')}</span>
          </Button>
        </form>

        {playlists.length === 0 ? (
          <EmptyState
            icon="list-music"
            title={t('playlists.emptyTitle')}
            description={t('playlists.emptyDescription')}
          />
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {visiblePlaylists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  inVoice={inVoice}
                  isExpanded={expandedIds.has(playlist.id)}
                  isLoading={loadingPlaylistId === playlist.id}
                  locale={locale}
                  t={t}
                  onLoad={onLoadPlaylist}
                  onToggleExpand={onToggleExpand}
                  onDelete={onDeletePlaylist}
                  onOpenLink={onOpenLink}
                  onCopyLink={onCopyLink}
                />
              ))}
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
