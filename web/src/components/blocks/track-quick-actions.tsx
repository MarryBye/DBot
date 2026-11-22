import type { TranslateFn } from '@/i18n';
import type { FavoriteTrackInput } from '@/types/api';
import { cn } from '@/utils/cn';
import { AddToPlaylistButton } from '@/components/ui/add-to-playlist-button';
import { FavoriteButton } from '@/components/ui/favorite-button';

export interface TrackQuickActionsProps {
  track: FavoriteTrackInput;
  isFavorite: boolean;
  isInPlaylist: boolean;
  size?: 'sm' | 'md';
  className?: string;
  t: TranslateFn;
  onToggleFavorite: (track: FavoriteTrackInput) => void;
  onAddToPlaylist: (track: FavoriteTrackInput) => void;
}

export function TrackQuickActions({
  track,
  isFavorite,
  isInPlaylist,
  size = 'sm',
  className,
  t,
  onToggleFavorite,
  onAddToPlaylist,
}: TrackQuickActionsProps) {
  return (
    <div className={cn('inline-flex shrink-0 items-center gap-0.5', className)}>
      <FavoriteButton
        active={isFavorite}
        size={size}
        label={isFavorite ? t('favorites.remove') : t('favorites.add')}
        onToggle={() => onToggleFavorite(track)}
      />
      <AddToPlaylistButton
        active={isInPlaylist}
        size={size}
        label={isInPlaylist ? t('playlists.manageInPlaylists') : t('playlists.addTrackAction')}
        onClick={() => onAddToPlaylist(track)}
      />
    </div>
  );
}
