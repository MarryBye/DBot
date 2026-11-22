import * as React from 'react';
import { formatDateTime, type Locale, type TranslateFn } from '@/i18n';
import type { UserPlaylist } from '@/types/api';
import { formatDuration, safeColor, safeHttpUrl } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { ReactionBar } from '@/components/ui/reaction-bar';
import { TruncatedText } from '@/components/ui/truncated-text';

const TRACKS_PAGE_SIZE = 8;

export interface PlaylistCardProps {
  playlist: UserPlaylist;
  mode: 'my' | 'public';
  inVoice: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  isCopying?: boolean;
  locale: Locale;
  t: TranslateFn;
  onLoad: (playlist: UserPlaylist) => void;
  onToggleExpand: (id: number) => void;
  onEdit: (playlist: UserPlaylist) => void;
  onTogglePublic: (playlist: UserPlaylist) => void;
  onCopy: (playlist: UserPlaylist) => void;
  onDelete: (playlist: UserPlaylist) => void;
  onRemoveTrack?: (playlist: UserPlaylist, index: number) => void;
  onReact: (playlist: UserPlaylist, value: 1 | -1) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function PlaylistCard({
  playlist,
  mode,
  inVoice,
  isExpanded,
  isLoading,
  isCopying = false,
  locale,
  t,
  onLoad,
  onToggleExpand,
  onEdit,
  onTogglePublic,
  onCopy,
  onDelete,
  onRemoveTrack,
  onReact,
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

  const accentColor = safeColor(playlist.color);
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
    ...(!playlist.isOwner
      ? ([
          {
            id: 'copy',
            label: t('playlists.copy'),
            icon: 'copy-plus',
            disabled: isCopying,
            separatorBefore: true,
            onSelect: () => onCopy(playlist),
          },
        ] satisfies ContextMenuItem[])
      : ([
          {
            id: 'edit',
            label: t('playlists.edit'),
            icon: 'pencil',
            separatorBefore: true,
            onSelect: () => onEdit(playlist),
          },
          {
            id: 'visibility',
            label: playlist.isPublic ? t('playlists.makePrivate') : t('playlists.makePublic'),
            icon: playlist.isPublic ? 'lock' : 'globe',
            onSelect: () => onTogglePublic(playlist),
          },
          {
            id: 'delete',
            label: t('playlists.delete'),
            icon: 'trash',
            destructive: true,
            separatorBefore: true,
            onSelect: () => onDelete(playlist),
          },
        ] satisfies ContextMenuItem[])),
  ];

  return (
    <Card
      className="overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      <ContextMenu items={cardMenuItems}>
        <div className="flex min-w-0 flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-white"
                style={{ backgroundColor: accentColor }}
              >
                <Icon name="list-music" size="xs" />
              </div>
              <TruncatedText
                text={playlist.name}
                as="h3"
                className="min-w-0 text-sm font-semibold leading-tight text-fg-primary"
              />
              {mode === 'my' && (
                <Badge variant={playlist.isPublic ? 'accent' : 'default'} className="shrink-0">
                  <Icon name={playlist.isPublic ? 'globe' : 'lock'} size="xs" />
                  <span>
                    {playlist.isPublic ? t('playlists.badgePublic') : t('playlists.badgePrivate')}
                  </span>
                </Badge>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
              {mode === 'public' && (
                <>
                  <Badge variant="default" className="max-w-[180px] normal-case tracking-normal">
                    <Icon name="user" size="xs" />
                    <TruncatedText text={playlist.authorName} />
                  </Badge>
                  <span>/</span>
                </>
              )}
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
            {playlist.isPublic && (
              <ReactionBar
                likes={playlist.likes}
                dislikes={playlist.dislikes}
                myVote={playlist.myVote}
                likeLabel={t('library.like')}
                dislikeLabel={t('library.dislike')}
                onVote={(val) => onReact(playlist, val)}
              />
            )}

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

            {!playlist.isOwner && (
              <Button
                variant="outline"
                size="sm"
                disabled={isCopying}
                onClick={() => onCopy(playlist)}
                title={t('playlists.copy')}
              >
                <Icon name="copy-plus" size="xs" />
                <span>{t('playlists.copy')}</span>
              </Button>
            )}

            {playlist.isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onTogglePublic(playlist)}
                  title={
                    playlist.isPublic ? t('playlists.makePrivate') : t('playlists.makePublic')
                  }
                  aria-label={
                    playlist.isPublic ? t('playlists.makePrivate') : t('playlists.makePublic')
                  }
                >
                  <Icon name={playlist.isPublic ? 'globe' : 'lock'} size="xs" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(playlist)}
                  title={t('playlists.edit')}
                  aria-label={t('playlists.edit')}
                >
                  <Icon name="pencil" size="xs" />
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
              </>
            )}
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
              const trackMenu: ContextMenuItem[] = [
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
                ...(playlist.isOwner && onRemoveTrack
                  ? [
                      {
                        id: 'remove-track',
                        label: t('playlists.removeTrackAction'),
                        icon: 'trash' as const,
                        destructive: true,
                        separatorBefore: Boolean(href),
                        onSelect: () => onRemoveTrack(playlist, globalIdx),
                      },
                    ]
                  : []),
              ];

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
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {track.durationFormatted || '0:00'}
                    </span>
                    {playlist.isOwner && onRemoveTrack && (
                      <Button
                        variant="danger-ghost"
                        size="icon-sm"
                        onClick={() => onRemoveTrack(playlist, globalIdx)}
                        title={t('playlists.removeTrackAction')}
                        aria-label={t('playlists.removeTrackAction')}
                      >
                        <Icon name="x" size="xs" />
                      </Button>
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
