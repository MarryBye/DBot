import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { FavoriteTrackInput, UserPlaylist } from '@/types/api';
import { buildTrackKey, safeColor } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { Switch } from '@/components/ui/switch';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';
import { TruncatedText } from '@/components/ui/truncated-text';

const MODAL_PLAYLISTS_PAGE_SIZE = 5;

export interface AddToPlaylistModalProps {
  open: boolean;
  track: FavoriteTrackInput | null;
  myPlaylists: UserPlaylist[];
  isSubmitting: boolean;
  t: TranslateFn;
  onSelectPlaylist: (playlist: UserPlaylist, track: FavoriteTrackInput) => void;
  onRemoveFromPlaylist: (playlist: UserPlaylist, track: FavoriteTrackInput) => void;
  onCreateWithTrack: (
    payload: { name: string; color: string; isPublic: boolean },
    track: FavoriteTrackInput
  ) => void;
  onClose: () => void;
}

export function AddToPlaylistModal({
  open,
  track,
  myPlaylists,
  isSubmitting,
  t,
  onSelectPlaylist,
  onRemoveFromPlaylist,
  onCreateWithTrack,
  onClose,
}: AddToPlaylistModalProps) {
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('#0067b8');
  const [newPublic, setNewPublic] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSearch('');
      setPage(1);
      setCreateOpen(myPlaylists.length === 0);
      setNewName('');
      setNewColor('#0067b8');
      setNewPublic(false);
    }
  }, [open, myPlaylists.length]);

  const targetKey = track ? buildTrackKey(track) : '';

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return myPlaylists;
    return myPlaylists.filter((p) => p.name.toLowerCase().includes(q));
  }, [myPlaylists, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / MODAL_PLAYLISTS_PAGE_SIZE));
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visible = filtered.slice(
    (page - 1) * MODAL_PLAYLISTS_PAGE_SIZE,
    page * MODAL_PLAYLISTS_PAGE_SIZE
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!track) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateWithTrack({ name: trimmed, color: newColor, isPublic: newPublic }, track);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('playlists.addTrackModalTitle')}</DialogTitle>
        </DialogHeader>

        {track && (
          <div className="mt-3 space-y-3">
            {/* Selected Track Preview */}
            <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[2px] border border-border bg-subtle/50 p-2.5">
              <TrackThumbnail src={track.thumbnail} alt={track.title} size="sm" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <TruncatedText
                  text={track.title}
                  as="div"
                  className="text-xs font-semibold text-fg-primary"
                />
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted">
                  <PlatformBadge source={track.source} compact />
                  {track.author && <TruncatedText text={track.author} className="min-w-0" />}
                </div>
              </div>
            </div>

            {!createOpen ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
                      <Icon name="search" size="xs" />
                    </div>
                    <Input
                      value={search}
                      placeholder={t('playlists.searchMyPlaceholder')}
                      autoComplete="off"
                      className="pl-8"
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={isSubmitting}
                    onClick={() => setCreateOpen(true)}
                    className="shrink-0"
                  >
                    <Icon name="plus" size="xs" />
                    <span>{t('playlists.createNewShort')}</span>
                  </Button>
                </div>

                {myPlaylists.length === 0 ? (
                  <EmptyState
                    icon="list-music"
                    title={t('playlists.emptyTitle')}
                    compact
                  />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon="search"
                    title={t('library.emptyFilteredTitle')}
                    compact
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1.5">
                      {visible.map((pl) => {
                        const alreadyIn = pl.tracks.some((tr) => buildTrackKey(tr) === targetKey);
                        const color = safeColor(pl.color);
                        return (
                          <div
                            key={pl.id}
                            className="flex min-w-0 items-center justify-between gap-2.5 overflow-hidden rounded-[2px] border border-border bg-surface px-3 py-2"
                            style={{ borderLeftWidth: '3px', borderLeftColor: color }}
                          >
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="flex min-w-0 items-center gap-2">
                                <TruncatedText
                                  text={pl.name}
                                  className="text-xs font-semibold text-fg-primary"
                                />
                                <Badge
                                  variant={pl.isPublic ? 'accent' : 'default'}
                                  className="shrink-0"
                                >
                                  <Icon name={pl.isPublic ? 'globe' : 'lock'} size="xs" />
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-[11px] text-fg-muted">
                                {t('playlists.tracksCount', { count: pl.trackCount })}
                              </div>
                            </div>

                            {alreadyIn ? (
                              <Button
                                variant="danger-ghost"
                                size="sm"
                                disabled={isSubmitting}
                                onClick={() => onRemoveFromPlaylist(pl, track)}
                                title={t('playlists.removeTrackAction')}
                                className="shrink-0 border border-danger/30 bg-danger-subtle/50 text-danger-fg hover:bg-danger-subtle"
                              >
                                <Icon name="trash" size="xs" />
                                <span>{t('playlists.removeTrackShort')}</span>
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={isSubmitting}
                                onClick={() => onSelectPlaylist(pl, track)}
                                className="shrink-0"
                              >
                                <Icon name="plus" size="xs" />
                                <span>{t('search.add')}</span>
                              </Button>
                            )}
                          </div>
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
                  </div>
                )}

                <DialogFooter>
                  <Button variant="secondary" onClick={onClose}>
                    {t('dialog.cancel')}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="add-to-new-playlist-name"
                    className="block text-xs font-semibold text-fg-secondary"
                  >
                    {t('playlists.nameLabel')}
                  </label>
                  <Input
                    id="add-to-new-playlist-name"
                    value={newName}
                    maxLength={60}
                    required
                    autoFocus
                    disabled={isSubmitting}
                    placeholder={t('playlists.savePlaceholder')}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-fg-secondary">
                    {t('playlists.colorLabel')}
                  </span>
                  <ColorPicker
                    value={newColor}
                    disabled={isSubmitting}
                    label={t('playlists.colorLabel')}
                    onChange={setNewColor}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-[2px] border border-border bg-subtle/40 p-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <label
                      htmlFor="add-to-new-playlist-public"
                      className="block cursor-pointer text-xs font-semibold text-fg-primary"
                    >
                      {t('playlists.visibilityLabel')}
                    </label>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      {t('playlists.visibilityDescription')}
                    </p>
                  </div>
                  <Switch
                    id="add-to-new-playlist-public"
                    checked={newPublic}
                    disabled={isSubmitting}
                    ariaLabel={t('playlists.visibilityLabel')}
                    onCheckedChange={setNewPublic}
                    className="mt-0.5"
                  />
                </div>

                <DialogFooter>
                  {myPlaylists.length > 0 && (
                    <Button
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => setCreateOpen(false)}
                    >
                      {t('playlists.backToList')}
                    </Button>
                  )}
                  <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
                    {t('dialog.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" disabled={isSubmitting || !newName.trim()}>
                    <Icon name="plus" size="xs" />
                    <span>{t('playlists.createAndAdd')}</span>
                  </Button>
                </DialogFooter>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
