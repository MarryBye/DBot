import * as React from 'react';
import type { Locale, TranslateFn } from '@/i18n';
import type {
  FavoriteTrackInput,
  FavoriteTrackItem,
  LibrarySortOption,
  MyTracksTab,
  UserPlaylist,
} from '@/types/api';
import { safeHttpUrl } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { SectionHeader } from '@/components/ui/section-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';
import { TruncatedText } from '@/components/ui/truncated-text';
import { LibraryFilterBar, type LibraryAuthorOption } from './library-filter-bar';
import { PlaylistCard } from './playlist-card';
import { TrackQuickActions } from './track-quick-actions';

const FAVORITES_PAGE_SIZE = 10;
const PLAYLISTS_PAGE_SIZE = 6;

function sortPlaylists(list: UserPlaylist[], sortBy: LibrarySortOption): UserPlaylist[] {
  const copy = [...list];
  const getTime = (p: UserPlaylist) => new Date(p.updatedAt || p.createdAt || 0).getTime();

  copy.sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return getTime(a) - getTime(b);
      case 'likes':
        return b.likes - a.likes || a.dislikes - b.dislikes || getTime(b) - getTime(a);
      case 'dislikes':
        return b.dislikes - a.dislikes || getTime(b) - getTime(a);
      case 'author':
        return a.authorName.localeCompare(b.authorName) || a.name.localeCompare(b.name);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
      default:
        return getTime(b) - getTime(a);
    }
  });
  return copy;
}

export interface PlaylistsSectionProps {
  activeSubTab: MyTracksTab;
  favorites: FavoriteTrackItem[];
  myPlaylists: UserPlaylist[];
  publicPlaylists: UserPlaylist[];
  playlistTrackKeys: ReadonlySet<string>;
  inVoice: boolean;
  canSaveQueue: boolean;
  isSaving: boolean;
  isPlayingAllFavorites: boolean;
  addingFavoriteId: number | null;
  loadingPlaylistId: number | null;
  copyingPlaylistId: number | null;
  expandedIds: ReadonlySet<number>;
  locale: Locale;
  t: TranslateFn;
  onSubTabChange: (tab: MyTracksTab) => void;
  onPlayFavorite: (item: FavoriteTrackItem) => void;
  onPlayAllFavorites: () => void;
  onRemoveFavorite: (item: FavoriteTrackItem) => void;
  onAddTrackToPlaylist: (track: FavoriteTrackInput) => void;
  onRequestSaveQueue: () => void;
  onLoadPlaylist: (playlist: UserPlaylist) => void;
  onEditPlaylist: (playlist: UserPlaylist) => void;
  onTogglePlaylistPublic: (playlist: UserPlaylist) => void;
  onCopyPlaylist: (playlist: UserPlaylist) => void;
  onDeletePlaylist: (playlist: UserPlaylist) => void;
  onRemovePlaylistTrack: (playlist: UserPlaylist, index: number) => void;
  onReactPlaylist: (playlist: UserPlaylist, value: 1 | -1) => void;
  onToggleExpand: (id: number) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function PlaylistsSection({
  activeSubTab,
  favorites,
  myPlaylists,
  publicPlaylists,
  playlistTrackKeys,
  inVoice,
  canSaveQueue,
  isSaving,
  isPlayingAllFavorites,
  addingFavoriteId,
  loadingPlaylistId,
  copyingPlaylistId,
  expandedIds,
  locale,
  t,
  onSubTabChange,
  onPlayFavorite,
  onPlayAllFavorites,
  onRemoveFavorite,
  onAddTrackToPlaylist,
  onRequestSaveQueue,
  onLoadPlaylist,
  onEditPlaylist,
  onTogglePlaylistPublic,
  onCopyPlaylist,
  onDeletePlaylist,
  onRemovePlaylistTrack,
  onReactPlaylist,
  onToggleExpand,
  onOpenLink,
  onCopyLink,
}: PlaylistsSectionProps) {
  const [favQuery, setFavQuery] = React.useState('');
  const [favPage, setFavPage] = React.useState(1);
  const [myPage, setMyPage] = React.useState(1);

  const [publicSearch, setPublicSearch] = React.useState('');
  const [publicAuthor, setPublicAuthor] = React.useState('all');
  const [publicSort, setPublicSort] = React.useState<LibrarySortOption>('newest');
  const [publicPage, setPublicPage] = React.useState(1);

  // Filtered favorites
  const filteredFavorites = React.useMemo(() => {
    const q = favQuery.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q)
    );
  }, [favorites, favQuery]);

  const totalFavPages = Math.max(1, Math.ceil(filteredFavorites.length / FAVORITES_PAGE_SIZE));
  React.useEffect(() => {
    if (favPage > totalFavPages) setFavPage(totalFavPages);
  }, [favPage, totalFavPages]);
  const visibleFavorites = filteredFavorites.slice(
    (favPage - 1) * FAVORITES_PAGE_SIZE,
    favPage * FAVORITES_PAGE_SIZE
  );

  // My playlists pagination
  const totalMyPages = Math.max(1, Math.ceil(myPlaylists.length / PLAYLISTS_PAGE_SIZE));
  React.useEffect(() => {
    if (myPage > totalMyPages) setMyPage(totalMyPages);
  }, [myPage, totalMyPages]);
  const visibleMyPlaylists = myPlaylists.slice(
    (myPage - 1) * PLAYLISTS_PAGE_SIZE,
    myPage * PLAYLISTS_PAGE_SIZE
  );

  // Public playlists authors, filter & sort
  const publicAuthors = React.useMemo<LibraryAuthorOption[]>(() => {
    const map = new Map<string, string>();
    for (const pl of publicPlaylists) {
      if (!map.has(pl.userId)) {
        map.set(
          pl.userId,
          pl.authorUsername ? `${pl.authorName} (@${pl.authorUsername})` : pl.authorName
        );
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [publicPlaylists]);

  const filteredPublicPlaylists = React.useMemo(() => {
    const q = publicSearch.trim().toLowerCase();
    const filtered = publicPlaylists.filter((pl) => {
      if (publicAuthor !== 'all' && pl.userId !== publicAuthor) return false;
      if (q) {
        const hit =
          pl.name.toLowerCase().includes(q) ||
          pl.authorName.toLowerCase().includes(q) ||
          (pl.authorUsername?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      return true;
    });
    return sortPlaylists(filtered, publicSort);
  }, [publicPlaylists, publicSearch, publicAuthor, publicSort]);

  const totalPublicPages = Math.max(
    1,
    Math.ceil(filteredPublicPlaylists.length / PLAYLISTS_PAGE_SIZE)
  );
  React.useEffect(() => {
    if (publicPage > totalPublicPages) setPublicPage(totalPublicPages);
  }, [publicPage, totalPublicPages]);
  const visiblePublicPlaylists = filteredPublicPlaylists.slice(
    (publicPage - 1) * PLAYLISTS_PAGE_SIZE,
    publicPage * PLAYLISTS_PAGE_SIZE
  );

  const publicFiltered =
    publicSearch.trim().length > 0 || publicAuthor !== 'all';

  return (
    <Tabs
      value={activeSubTab}
      onValueChange={(value) => onSubTabChange(value as MyTracksTab)}
      className="space-y-4"
    >
      <TabsList className="w-full justify-start">
        <TabsTrigger value="favorites">
          <Icon name="heart" size="sm" />
          <span>{t('tracks.tabFavorites')}</span>
          <Badge variant="default" className="ml-0.5 tabular-nums">
            {favorites.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="my">
          <Icon name="list-music" size="sm" />
          <span>{t('tracks.tabMyPlaylists')}</span>
          <Badge variant="default" className="ml-0.5 tabular-nums">
            {myPlaylists.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="public">
          <Icon name="globe" size="sm" />
          <span>{t('tracks.tabPublicPlaylists')}</span>
          <Badge variant="default" className="ml-0.5 tabular-nums">
            {publicPlaylists.length}
          </Badge>
        </TabsTrigger>
      </TabsList>

      {/* Sub-tab 1: Favorite Tracks */}
      <TabsContent value="favorites">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <SectionHeader
              title={t('favorites.title')}
              count={favorites.length}
              description={t('favorites.description')}
              actions={
                favorites.length > 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!inVoice || isPlayingAllFavorites}
                    onClick={onPlayAllFavorites}
                    title={inVoice ? t('favorites.playAll') : t('soundboard.joinVoiceFirst')}
                  >
                    <Icon name="plus" size="xs" />
                    <span>{t('favorites.playAll')}</span>
                  </Button>
                ) : undefined
              }
            />
          </CardHeader>

          <CardContent className="space-y-3 pt-4">
            {favorites.length > 0 && (
              <div className="relative max-w-md">
                <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
                  <Icon name="search" size="xs" />
                </div>
                <Input
                  value={favQuery}
                  placeholder={t('favorites.searchPlaceholder')}
                  autoComplete="off"
                  className="pl-8 pr-8"
                  onChange={(e) => {
                    setFavQuery(e.target.value);
                    setFavPage(1);
                  }}
                />
                {favQuery && (
                  <button
                    type="button"
                    aria-label={t('logs.resetFilters')}
                    onClick={() => {
                      setFavQuery('');
                      setFavPage(1);
                    }}
                    className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[2px] text-fg-muted hover:bg-subtle hover:text-fg-primary"
                  >
                    <Icon name="x" size="xs" />
                  </button>
                )}
              </div>
            )}

            {favorites.length === 0 ? (
              <EmptyState
                icon="heart"
                title={t('favorites.emptyTitle')}
                description={t('favorites.emptyDescription')}
              />
            ) : filteredFavorites.length === 0 ? (
              <EmptyState
                icon="search"
                title={t('library.emptyFilteredTitle')}
                description={t('library.emptyFilteredDescription')}
              />
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  {visibleFavorites.map((item) => {
                    const href = safeHttpUrl(item.originalUrl || item.url);
                    const isAdding = addingFavoriteId === item.id;
                    const trackPayload: FavoriteTrackInput = {
                      id: item.trackId,
                      title: item.title,
                      author: item.author,
                      url: item.url,
                      originalUrl: item.originalUrl,
                      durationSec: item.durationSec,
                      durationFormatted: item.durationFormatted,
                      thumbnail: item.thumbnail,
                      source: item.source,
                      mediaKind: item.mediaKind,
                    };
                    const menuItems: ContextMenuItem[] = [
                      {
                        id: 'add',
                        label: t('ctx.addToQueue'),
                        icon: 'plus',
                        disabled: !inVoice || isAdding,
                        onSelect: () => onPlayFavorite(item),
                      },
                      {
                        id: 'add-to-playlist',
                        label: t('playlists.addTrackAction'),
                        icon: 'list-plus',
                        separatorBefore: true,
                        onSelect: () => onAddTrackToPlaylist(trackPayload),
                      },
                      ...(href
                        ? [
                            {
                              id: 'open',
                              label: t('ctx.openLink'),
                              icon: 'external-link' as const,
                              onSelect: () => onOpenLink(href),
                            },
                            {
                              id: 'copy',
                              label: t('ctx.copyLink'),
                              icon: 'copy' as const,
                              onSelect: () => onCopyLink(href),
                            },
                          ]
                        : []),
                      {
                        id: 'remove',
                        label: t('favorites.remove'),
                        icon: 'heart',
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () => onRemoveFavorite(item),
                      },
                    ];

                    return (
                      <ContextMenu key={item.id} items={menuItems}>
                        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[2px] border border-border bg-surface px-2.5 py-2 transition-colors hover:bg-subtle/60">
                          <TrackThumbnail
                            src={item.thumbnail}
                            alt={item.title}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="min-w-0 text-sm font-medium text-fg-primary">
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block min-w-0 hover:text-accent hover:underline"
                                >
                                  <TruncatedText text={item.title} />
                                </a>
                              ) : (
                                <TruncatedText text={item.title} />
                              )}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                              <PlatformBadge source={item.source} compact />
                              {item.author && (
                                <TruncatedText text={item.author} className="max-w-[180px] shrink" />
                              )}
                              {item.durationFormatted && (
                                <>
                                  <span className="shrink-0">/</span>
                                  <span className="shrink-0 tabular-nums">
                                    {item.durationFormatted}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <TrackQuickActions
                              track={trackPayload}
                              isFavorite
                              isInPlaylist={playlistTrackKeys.has(item.trackKey)}
                              t={t}
                              onToggleFavorite={() => onRemoveFavorite(item)}
                              onAddToPlaylist={onAddTrackToPlaylist}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!inVoice || isAdding}
                              onClick={() => onPlayFavorite(item)}
                              title={inVoice ? t('search.add') : t('soundboard.joinVoiceFirst')}
                            >
                              <Icon name="plus" size="xs" />
                              <span>{isAdding ? t('player.adding') : t('search.add')}</span>
                            </Button>
                          </div>
                        </div>
                      </ContextMenu>
                    );
                  })}
                </div>

                {totalFavPages > 1 && (
                  <Pagination
                    page={favPage}
                    totalPages={totalFavPages}
                    hasPrev={favPage > 1}
                    hasNext={favPage < totalFavPages}
                    t={t}
                    onPrev={() => setFavPage((p) => Math.max(1, p - 1))}
                    onNext={() => setFavPage((p) => Math.min(totalFavPages, p + 1))}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Sub-tab 2: My Playlists */}
      <TabsContent value="my">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <SectionHeader
              title={t('playlists.title')}
              count={myPlaylists.length}
              description={t('playlists.description')}
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canSaveQueue || isSaving}
                  onClick={onRequestSaveQueue}
                >
                  <Icon name="save" size="xs" />
                  <span>{isSaving ? t('playlists.saving') : t('playlists.saveButton')}</span>
                </Button>
              }
            />
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {myPlaylists.length === 0 ? (
              <EmptyState
                icon="list-music"
                title={t('playlists.emptyTitle')}
                description={t('playlists.emptyDescription')}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  {visibleMyPlaylists.map((playlist) => (
                    <PlaylistCard
                      key={playlist.id}
                      playlist={playlist}
                      mode="my"
                      inVoice={inVoice}
                      isExpanded={expandedIds.has(playlist.id)}
                      isLoading={loadingPlaylistId === playlist.id}
                      isCopying={copyingPlaylistId === playlist.id}
                      locale={locale}
                      t={t}
                      onLoad={onLoadPlaylist}
                      onToggleExpand={onToggleExpand}
                      onEdit={onEditPlaylist}
                      onTogglePublic={onTogglePlaylistPublic}
                      onCopy={onCopyPlaylist}
                      onDelete={onDeletePlaylist}
                      onRemoveTrack={onRemovePlaylistTrack}
                      onReact={onReactPlaylist}
                      onOpenLink={onOpenLink}
                      onCopyLink={onCopyLink}
                    />
                  ))}
                </div>

                {totalMyPages > 1 && (
                  <Pagination
                    page={myPage}
                    totalPages={totalMyPages}
                    hasPrev={myPage > 1}
                    hasNext={myPage < totalMyPages}
                    t={t}
                    onPrev={() => setMyPage((p) => Math.max(1, p - 1))}
                    onNext={() => setMyPage((p) => Math.min(totalMyPages, p + 1))}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Sub-tab 3: Public Server Playlists */}
      <TabsContent value="public">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <SectionHeader
              title={t('playlists.publicTitle')}
              count={filteredPublicPlaylists.length}
              description={t('playlists.publicDescription')}
            />
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {publicPlaylists.length > 0 && (
              <LibraryFilterBar
                searchQuery={publicSearch}
                authorFilter={publicAuthor}
                sortBy={publicSort}
                authors={publicAuthors}
                searchPlaceholder={t('playlists.searchPublicPlaceholder')}
                t={t}
                onSearchChange={(val) => {
                  setPublicSearch(val);
                  setPublicPage(1);
                }}
                onAuthorChange={(val) => {
                  setPublicAuthor(val);
                  setPublicPage(1);
                }}
                onSortChange={(val) => {
                  setPublicSort(val);
                  setPublicPage(1);
                }}
                onReset={() => {
                  setPublicSearch('');
                  setPublicAuthor('all');
                  setPublicSort('newest');
                  setPublicPage(1);
                }}
              />
            )}

            {publicPlaylists.length === 0 ? (
              <EmptyState
                icon="globe"
                title={t('playlists.emptyPublicTitle')}
                description={t('playlists.emptyPublicDescription')}
              />
            ) : filteredPublicPlaylists.length === 0 ? (
              <EmptyState
                icon="search"
                title={publicFiltered ? t('library.emptyFilteredTitle') : t('playlists.emptyPublicTitle')}
                description={
                  publicFiltered
                    ? t('library.emptyFilteredDescription')
                    : t('playlists.emptyPublicDescription')
                }
              />
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  {visiblePublicPlaylists.map((playlist) => (
                    <PlaylistCard
                      key={playlist.id}
                      playlist={playlist}
                      mode="public"
                      inVoice={inVoice}
                      isExpanded={expandedIds.has(playlist.id)}
                      isLoading={loadingPlaylistId === playlist.id}
                      isCopying={copyingPlaylistId === playlist.id}
                      locale={locale}
                      t={t}
                      onLoad={onLoadPlaylist}
                      onToggleExpand={onToggleExpand}
                      onEdit={onEditPlaylist}
                      onTogglePublic={onTogglePlaylistPublic}
                      onCopy={onCopyPlaylist}
                      onDelete={onDeletePlaylist}
                      onRemoveTrack={onRemovePlaylistTrack}
                      onReact={onReactPlaylist}
                      onOpenLink={onOpenLink}
                      onCopyLink={onCopyLink}
                    />
                  ))}
                </div>

                {totalPublicPages > 1 && (
                  <Pagination
                    page={publicPage}
                    totalPages={totalPublicPages}
                    hasPrev={publicPage > 1}
                    hasNext={publicPage < totalPublicPages}
                    t={t}
                    onPrev={() => setPublicPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPublicPage((p) => Math.min(totalPublicPages, p + 1))}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
