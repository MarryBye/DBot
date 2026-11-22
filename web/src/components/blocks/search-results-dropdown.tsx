import type { TranslateFn } from '@/i18n';
import type { SearchResultItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { Spinner } from '@/components/ui/spinner';
import { SearchResultRow } from './search-result-row';

export interface SearchResultsDropdownProps {
  query: string;
  items: SearchResultItem[];
  page: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  isSearching: boolean;
  addingResultId: string | null;
  addedResultIds: ReadonlySet<string>;
  disabled: boolean;
  t: TranslateFn;
  onAddResult: (result: SearchResultItem) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
}

export function SearchResultsDropdown({
  query,
  items,
  page,
  hasPrevPage,
  hasNextPage,
  isSearching,
  addingResultId,
  addedResultIds,
  disabled,
  t,
  onAddResult,
  onPrevPage,
  onNextPage,
  onClose,
}: SearchResultsDropdownProps) {
  return (
    <div
      role="region"
      aria-label={t('search.resultsTitle', { query })}
      className="absolute left-0 right-0 top-full z-40 mt-1.5 flex flex-col overflow-hidden rounded-[2px] border border-border-strong bg-surface shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-subtle/50 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="search" size="xs" className="text-fg-muted" />
          <span className="truncate text-xs font-semibold text-fg-primary">
            {t('search.resultsTitle', { query })}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isSearching && (
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Spinner size="sm" />
              <span className="hidden sm:inline">{t('search.searchingMore')}</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t('search.close')}
            aria-label={t('search.close')}
          >
            <Icon name="x" size="xs" />
          </Button>
        </div>
      </div>

      {/* Results list */}
      <div className="max-h-[380px] space-y-1.5 overflow-y-auto p-3">
        {items.length === 0 && !isSearching ? (
          <EmptyState
            icon="search"
            title={t('search.emptyTitle')}
            description={t('search.emptyDescription')}
            compact
          />
        ) : (
          <>
            {items.map((item) => (
              <SearchResultRow
                key={item.id}
                result={item}
                isAdded={addedResultIds.has(item.id)}
                isAdding={addingResultId === item.id}
                disabled={disabled}
                t={t}
                onAdd={onAddResult}
              />
            ))}

            {isSearching && (
              <div className="flex items-center justify-center gap-2 rounded-[2px] border border-dashed border-border bg-subtle/40 py-2.5 text-xs text-fg-muted">
                <Spinner size="sm" />
                <span>{t('search.searchingMore')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shared Pagination Footer */}
      <div className="bg-subtle/40 px-3.5 pb-2">
        <Pagination
          page={page}
          hasPrev={hasPrevPage}
          hasNext={hasNextPage}
          disabled={isSearching}
          t={t}
          onPrev={onPrevPage}
          onNext={onNextPage}
        />
      </div>
    </div>
  );
}
