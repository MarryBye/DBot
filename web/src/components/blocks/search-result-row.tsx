import type { TranslateFn } from '@/i18n';
import type { SearchResultItem, SearchResultKind } from '@/types/api';
import { safeHttpUrl } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';
import { TruncatedText } from '@/components/ui/truncated-text';

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
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function SearchResultRow({
  result,
  isAdded,
  isAdding,
  disabled,
  t,
  onAdd,
  onOpenLink,
  onCopyLink,
}: SearchResultRowProps) {
  const kindIcon = KIND_ICON[result.kind] ?? 'music';
  const safeLink = safeHttpUrl(result.url);

  const menuItems: ContextMenuItem[] = [
    {
      id: 'add',
      label: t('ctx.addToQueue'),
      icon: 'plus',
      disabled: disabled || isAdding,
      onSelect: () => onAdd(result),
    },
    ...(safeLink
      ? [
          {
            id: 'open',
            label: t('ctx.openLink'),
            icon: 'external-link' as const,
            separatorBefore: true,
            onSelect: () => onOpenLink(safeLink),
          },
          {
            id: 'copy',
            label: t('ctx.copyLink'),
            icon: 'copy' as const,
            onSelect: () => onCopyLink(safeLink),
          },
        ]
      : []),
  ];

  return (
    <ContextMenu items={menuItems}>
      <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-[2px] border border-border bg-surface px-3 py-2 transition-colors hover:bg-subtle/70">
        <TrackThumbnail
          src={result.thumbnail}
          alt={result.title}
          size="sm"
          fallbackIcon={kindIcon}
        />

        <div className="min-w-0 flex-1 overflow-hidden">
          <TruncatedText
            text={result.title}
            as="div"
            className="text-sm font-medium text-fg-primary"
          />
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <PlatformBadge source={result.source} />
            <Badge variant={result.kind === 'stream' ? 'danger' : 'default'}>
              <Icon name={kindIcon} size="xs" />
              <span>{t(`search.kind.${result.kind}`)}</span>
            </Badge>
            <TruncatedText
              text={result.author}
              className="max-w-[160px] shrink text-fg-secondary"
            />
            {(result.isLive || result.durationFormatted || result.trackCount !== undefined) && (
              <>
                <span className="shrink-0">/</span>
                {result.isLive ? (
                  <Badge variant="danger">{t('search.live')}</Badge>
                ) : result.kind === 'playlist' && result.trackCount !== undefined ? (
                  <span className="shrink-0 tabular-nums">
                    {t('search.tracksCount', { count: result.trackCount })}
                  </span>
                ) : (
                  <span className="shrink-0 tabular-nums">{result.durationFormatted}</span>
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
    </ContextMenu>
  );
}
