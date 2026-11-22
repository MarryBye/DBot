import type { TextCode, TranslateFn } from '@/i18n';
import type { LibrarySortOption } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface LibraryAuthorOption {
  id: string;
  label: string;
}

const SORT_OPTIONS: Array<{ value: LibrarySortOption; labelCode: TextCode }> = [
  { value: 'newest', labelCode: 'library.sort.newest' },
  { value: 'oldest', labelCode: 'library.sort.oldest' },
  { value: 'likes', labelCode: 'library.sort.likes' },
  { value: 'dislikes', labelCode: 'library.sort.dislikes' },
  { value: 'author', labelCode: 'library.sort.author' },
  { value: 'name', labelCode: 'library.sort.name' },
];

export interface LibraryFilterBarProps {
  searchQuery: string;
  authorFilter: string;
  sortBy: LibrarySortOption;
  authors: LibraryAuthorOption[];
  searchPlaceholder: string;
  t: TranslateFn;
  onSearchChange: (value: string) => void;
  onAuthorChange: (authorId: string) => void;
  onSortChange: (sort: LibrarySortOption) => void;
  onReset: () => void;
}

export function LibraryFilterBar({
  searchQuery,
  authorFilter,
  sortBy,
  authors,
  searchPlaceholder,
  t,
  onSearchChange,
  onAuthorChange,
  onSortChange,
  onReset,
}: LibraryFilterBarProps) {
  const hasFilters =
    searchQuery.trim().length > 0 || authorFilter !== 'all' || sortBy !== 'newest';

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="relative min-w-0">
        <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
          <Icon name="search" size="xs" />
        </div>
        <Input
          value={searchQuery}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="pl-8 pr-8"
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            aria-label={t('logs.resetFilters')}
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[2px] text-fg-muted hover:bg-subtle hover:text-fg-primary"
          >
            <Icon name="x" size="xs" />
          </button>
        )}
      </div>

      <Select value={authorFilter} onValueChange={onAuthorChange}>
        <SelectTrigger aria-label={t('library.filterAuthor')}>
          <SelectValue placeholder={t('library.filterAuthor')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('library.allAuthors')}</SelectItem>
          {authors.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sortBy} onValueChange={(v) => onSortChange(v as LibrarySortOption)}>
        <SelectTrigger aria-label={t('library.sortLabel')}>
          <SelectValue placeholder={t('library.sortLabel')} />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelCode)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="md" onClick={onReset} className="shrink-0">
          <Icon name="rotate-ccw" size="xs" />
          <span>{t('logs.resetFilters')}</span>
        </Button>
      )}
    </div>
  );
}
