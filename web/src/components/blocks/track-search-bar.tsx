import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { FavoriteTrackInput, PlatformOption, SearchResultItem, TrackSource } from '@/types/api';
import { cn } from '@/utils/cn';
import { isDirectUrl } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { PlatformIcon } from '@/components/ui/platform-badge';
import { SearchResultsDropdown } from './search-results-dropdown';

export interface TrackSearchBarProps {
  query: string;
  platform: PlatformOption;
  disabled: boolean;
  isSubmittingDirect: boolean;
  searchOpen: boolean;
  activeSearchQuery: string;
  searchResults: SearchResultItem[];
  searchPage: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  isSearching: boolean;
  addingResultId: string | null;
  addedResultIds: ReadonlySet<string>;
  favoriteTrackKeys: ReadonlySet<string>;
  playlistTrackKeys: ReadonlySet<string>;
  t: TranslateFn;
  onQueryChange: (value: string) => void;
  onPlatformChange: (platform: PlatformOption) => void;
  onSearchSubmit: () => void;
  onDirectUrlSubmit: () => void;
  onAddSearchResult: (result: SearchResultItem) => void;
  onToggleFavorite: (track: FavoriteTrackInput) => void;
  onAddToPlaylist: (track: FavoriteTrackInput) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
  onPrevSearchPage: () => void;
  onNextSearchPage: () => void;
  onCloseSearch: () => void;
}

const PLATFORMS: ReadonlyArray<{ value: PlatformOption; source?: TrackSource }> = [
  { value: 'auto' },
  { value: 'youtube', source: 'youtube' },
  { value: 'soundcloud', source: 'soundcloud' },
  { value: 'spotify', source: 'spotify' },
];

export function TrackSearchBar({
  query,
  platform,
  disabled,
  isSubmittingDirect,
  searchOpen,
  activeSearchQuery,
  searchResults,
  searchPage,
  hasPrevPage,
  hasNextPage,
  isSearching,
  addingResultId,
  addedResultIds,
  favoriteTrackKeys,
  playlistTrackKeys,
  t,
  onQueryChange,
  onPlatformChange,
  onSearchSubmit,
  onDirectUrlSubmit,
  onAddSearchResult,
  onToggleFavorite,
  onAddToPlaylist,
  onOpenLink,
  onCopyLink,
  onPrevSearchPage,
  onNextSearchPage,
  onCloseSearch,
}: TrackSearchBarProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const directLink = isDirectUrl(query);

  React.useEffect(() => {
    if (!searchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onCloseSearch();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseSearch();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchOpen, onCloseSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || disabled) return;
    if (directLink) {
      onDirectUrlSubmit();
    } else {
      onSearchSubmit();
    }
  };

  const busy = directLink ? isSubmittingDirect : false;

  return (
    <div ref={containerRef} className="relative">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
            {PLATFORMS.map((item) => {
              const active = platform === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPlatformChange(item.value)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[2px] border px-2.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-accent bg-accent-subtle text-accent-fg font-semibold'
                      : 'border-border bg-subtle text-fg-secondary hover:bg-hover hover:text-fg-primary'
                  )}
                >
                  {item.source ? (
                    <PlatformIcon source={item.source} size="xs" />
                  ) : (
                    <Icon name="sparkles" size="xs" />
                  )}
                  <span>{t(`platform.${item.value}`)}</span>
                </button>
              );
            })}
          </div>

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
            <Input
              value={query}
              disabled={disabled || busy}
              placeholder={t('player.searchPlaceholder')}
              autoComplete="off"
              onChange={(e) => onQueryChange(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={disabled || busy || !query.trim()}
              className="shrink-0 sm:min-w-[128px]"
            >
              <Icon name={directLink ? 'plus' : 'search'} size="sm" />
              <span>
                {directLink
                  ? busy
                    ? t('player.adding')
                    : t('player.add')
                  : t('player.searchButton')}
              </span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {searchOpen && (
        <SearchResultsDropdown
          query={activeSearchQuery}
          items={searchResults}
          page={searchPage}
          hasPrevPage={hasPrevPage}
          hasNextPage={hasNextPage}
          isSearching={isSearching}
          addingResultId={addingResultId}
          addedResultIds={addedResultIds}
          favoriteTrackKeys={favoriteTrackKeys}
          playlistTrackKeys={playlistTrackKeys}
          disabled={disabled}
          t={t}
          onAddResult={onAddSearchResult}
          onToggleFavorite={onToggleFavorite}
          onAddToPlaylist={onAddToPlaylist}
          onOpenLink={onOpenLink}
          onCopyLink={onCopyLink}
          onPrevPage={onPrevSearchPage}
          onNextPage={onNextSearchPage}
          onClose={onCloseSearch}
        />
      )}
    </div>
  );
}
