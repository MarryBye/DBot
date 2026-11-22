import type { TranslateFn } from '@/i18n';
import type { SearchResultItem, SearchResultKind } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';

const KIND_ICON: Record<SearchResultKind, IconName> = {
  music: 'music',
  video: 'video',
  stream: 'radio',
  track: 'disc',
  playlist: 'list-music',
};

export interface SearchResultRowProps {
  result: SearchResultItem;
  isAdded: boolean;
  isAdding: boolean;
  disabled: boolean;
  t: TranslateFn;
  onAdd: (result: SearchResultItem) => void;
}

export function SearchResultRow({
  result,
  isAdded,
  isAdding,
  disabled,
  t,
  onAdd,
}: SearchResultRowProps) {
  const kindIcon = KIND_ICON[result.kind] ?? 'music';

  return (
    <div className="flex items-center gap-3 rounded-[2px] border border-border bg-surface px-3 py-2 transition-colors hover:bg-subtle/70">
      <TrackThumbnail
        src={result.thumbnail}
        alt={result.title}
        size="sm"
        fallbackIcon={kindIcon}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg-primary" title={result.title}>
          {result.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <PlatformBadge source={result.source} />
          <Badge variant={result.kind === 'stream' ? 'danger' : 'default'}>
            <Icon name={kindIcon} size="xs" />
            <span>{t(`search.kind.${result.kind}`)}</span>
          </Badge>
          <span className="max-w-[160px] truncate text-fg-secondary">{result.author}</span>
          {(result.isLive || result.durationFormatted || result.trackCount !== undefined) && (
            <>
              <span>/</span>
              {result.isLive ? (
                <Badge variant="danger">{t('search.live')}</Badge>
              ) : result.kind === 'playlist' && result.trackCount !== undefined ? (
                <span className="tabular-nums">
                  {t('search.tracksCount', { count: result.trackCount })}
                </span>
              ) : (
                <span className="tabular-nums">{result.durationFormatted}</span>
              )}
            </>
          )}
        </div>
      </div>

      <Button
        variant={isAdded ? 'secondary' : 'primary'}
        size="sm"
        disabled={disabled || isAdding}
        onClick={() => onAdd(result)}
        className="shrink-0"
      >
        <Icon name={isAdded ? 'check' : 'plus'} size="xs" />
        <span>{isAdded ? t('search.added') : t('search.add')}</span>
      </Button>
    </div>
  );
}
