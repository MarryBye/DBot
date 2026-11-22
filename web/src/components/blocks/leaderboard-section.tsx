import type { TextCode, TranslateFn } from '@/i18n';
import type {
  LeaderboardQueryResult,
  LeaderboardSortBy,
  LeaderboardSortDir,
} from '@/types/api';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SectionHeader } from '@/components/ui/section-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatTile } from '@/components/ui/stat-tile';
import { formatVoiceTime, LeaderboardRow } from './leaderboard-row';

const SORT_OPTIONS: Array<{ value: LeaderboardSortBy; labelCode: TextCode }> = [
  { value: 'score', labelCode: 'leaderboard.sort.score' },
  { value: 'voiceSeconds', labelCode: 'leaderboard.sort.voiceSeconds' },
  { value: 'tracksAdded', labelCode: 'leaderboard.sort.tracksAdded' },
  { value: 'totalLikes', labelCode: 'leaderboard.sort.totalLikes' },
  { value: 'sfxPlayed', labelCode: 'leaderboard.sort.sfxPlayed' },
  { value: 'skipsCount', labelCode: 'leaderboard.sort.skipsCount' },
];

const TABLE_COLUMNS: Array<{ key: LeaderboardSortBy; labelCode: TextCode }> = [
  { key: 'voiceSeconds', labelCode: 'leaderboard.col.voiceTime' },
  { key: 'tracksAdded', labelCode: 'leaderboard.col.tracks' },
  { key: 'totalLikes', labelCode: 'leaderboard.col.likes' },
  { key: 'sfxPlayed', labelCode: 'leaderboard.col.sfx' },
  { key: 'skipsCount', labelCode: 'leaderboard.col.skips' },
  { key: 'score', labelCode: 'leaderboard.col.score' },
];

export interface LeaderboardSectionProps {
  result: LeaderboardQueryResult | null;
  currentUserId: string;
  canViewLogs: boolean;
  isLoading: boolean;
  sortBy: LeaderboardSortBy;
  sortDir: LeaderboardSortDir;
  searchQuery: string;
  t: TranslateFn;
  onSortByChange: (sortBy: LeaderboardSortBy) => void;
  onToggleSortDir: () => void;
  onColumnSortClick: (sortBy: LeaderboardSortBy) => void;
  onSearchQueryChange: (query: string) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onViewLogs: (userId: string) => void;
  onCopyText: (value: string) => void;
}

export function LeaderboardSection({
  result,
  currentUserId,
  canViewLogs,
  isLoading,
  sortBy,
  sortDir,
  searchQuery,
  t,
  onSortByChange,
  onToggleSortDir,
  onColumnSortClick,
  onSearchQueryChange,
  onResetFilters,
  onRefresh,
  onPageChange,
  onViewLogs,
  onCopyText,
}: LeaderboardSectionProps) {
  const entries = result?.entries ?? [];
  const summary = result?.summary ?? null;
  const myEntry = result?.myEntry ?? null;
  const currentPage = result?.page ?? 1;
  const pageSize = result?.pageSize ?? 15;
  const totalPages = result?.totalPages ?? 1;
  const hasSearch = searchQuery.trim().length > 0;
  const hasNonDefaultFilter = hasSearch || sortBy !== 'score' || sortDir !== 'desc';

  const myPage = myEntry ? Math.ceil(myEntry.rank / pageSize) : 1;
  const isMyEntryOnCurrentPage =
    myEntry !== null && entries.some((item) => item.userId === myEntry.userId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <SectionHeader
            title={t('leaderboard.title')}
            count={summary?.totalParticipants}
            description={t('leaderboard.description')}
            actions={
              <>
                {hasNonDefaultFilter && (
                  <Button variant="ghost" size="sm" onClick={onResetFilters}>
                    <Icon name="rotate-ccw" size="xs" />
                    <span>{t('leaderboard.resetFilters')}</span>
                  </Button>
                )}
                <Button variant="secondary" size="sm" disabled={isLoading} onClick={onRefresh}>
                  <Icon
                    name="refresh-cw"
                    size="xs"
                    className={isLoading ? 'animate-spin' : undefined}
                  />
                  <span>{t('leaderboard.refresh')}</span>
                </Button>
              </>
            }
          />
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {summary && (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <StatTile
                icon="users"
                label={t('leaderboard.summary.participants')}
                value={summary.totalParticipants}
                sublabel={
                  summary.activeListenersNow > 0
                    ? t('leaderboard.summary.listeningNow', { count: summary.activeListenersNow })
                    : undefined
                }
              />
              <StatTile
                icon="headphones"
                accent="accent"
                label={t('leaderboard.summary.voiceTime')}
                value={formatVoiceTime(summary.totalVoiceSeconds, t)}
              />
              <StatTile
                icon="music"
                accent="success"
                label={t('leaderboard.summary.tracks')}
                value={summary.totalTracksAdded}
              />
              <StatTile
                icon="thumbs-up"
                accent="warning"
                label={t('leaderboard.summary.likes')}
                value={summary.totalLikes}
              />
            </div>
          )}

          {/* Filter & sort bar */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
                <Icon name="search" size="xs" />
              </div>
              <Input
                value={searchQuery}
                placeholder={t('leaderboard.searchPlaceholder')}
                autoComplete="off"
                className="pl-8 pr-8"
                onChange={(e) => onSearchQueryChange(e.target.value)}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t('leaderboard.resetFilters')}
                  aria-label={t('leaderboard.resetFilters')}
                  onClick={() => onSearchQueryChange('')}
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-fg-muted"
                >
                  <Icon name="x" size="xs" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
                <Select
                  value={sortBy}
                  onValueChange={(value) => onSortByChange(value as LeaderboardSortBy)}
                >
                  <SelectTrigger aria-label={t('leaderboard.sortLabel')}>
                    <SelectValue placeholder={t('leaderboard.sortLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelCode)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                size="icon"
                onClick={onToggleSortDir}
                title={
                  sortDir === 'desc'
                    ? t('leaderboard.sortDirDesc')
                    : t('leaderboard.sortDirAsc')
                }
                aria-label={
                  sortDir === 'desc'
                    ? t('leaderboard.sortDirDesc')
                    : t('leaderboard.sortDirAsc')
                }
                className="h-9 w-9 shrink-0"
              >
                <Icon name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size="xs" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current user summary strip */}
      {myEntry && summary && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-border border-l-[3px] border-l-accent bg-surface px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <Badge variant="accent" className="tabular-nums">
              <Icon name="trophy" size="xs" />
              <span>
                {t('leaderboard.yourRank', {
                  rank: myEntry.rank,
                  total: summary.totalParticipants,
                })}
              </span>
            </Badge>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Icon name="headphones" size="xs" className="text-fg-muted" />
                {formatVoiceTime(myEntry.voiceSeconds, t)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="music" size="xs" className="text-fg-muted" />
                {myEntry.tracksAdded}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="thumbs-up" size="xs" className="text-fg-muted" />
                {myEntry.totalLikes}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-accent">
                <Icon name="flame" size="xs" />
                {myEntry.score}
              </span>
            </div>
          </div>

          {!hasSearch && !isMyEntryOnCurrentPage && myPage >= 1 && myPage <= totalPages && (
            <Button variant="secondary" size="sm" onClick={() => onPageChange(myPage)}>
              <Icon name="arrow-up-to-line" size="xs" />
              <span>{t('leaderboard.jumpToMyRank')}</span>
            </Button>
          )}
        </div>
      )}

      {/* Main leaderboard list */}
      {isLoading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-[2px] border border-border bg-surface py-12">
          <Spinner size="md" />
          <p className="text-xs text-fg-muted">{t('leaderboard.loading')}</p>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="trophy"
          title={hasSearch ? t('leaderboard.emptyFilteredTitle') : t('leaderboard.emptyTitle')}
          description={
            hasSearch
              ? t('leaderboard.emptyFilteredDescription')
              : t('leaderboard.emptyDescription')
          }
        />
      ) : (
        <div className="space-y-3">
          <Card className="overflow-hidden">
            {/* Desktop sortable column header */}
            <div className="hidden border-b border-border bg-subtle/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted lg:grid lg:grid-cols-[2.75rem_minmax(0,1.7fr)_repeat(6,minmax(0,0.72fr))] lg:items-center lg:gap-3">
              <div>{t('leaderboard.col.rank')}</div>
              <div>{t('leaderboard.col.member')}</div>
              {TABLE_COLUMNS.map((col) => {
                const isActive = sortBy === col.key;
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => onColumnSortClick(col.key)}
                    className={cn(
                      'inline-flex items-center justify-end gap-1 text-right transition-colors hover:text-fg-primary',
                      isActive && 'text-accent'
                    )}
                  >
                    <span>{t(col.labelCode)}</span>
                    {isActive && (
                      <Icon
                        name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'}
                        size="xs"
                        className="h-3 w-3"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  isCurrentUser={entry.userId === currentUserId}
                  activeSortBy={sortBy}
                  canViewLogs={canViewLogs}
                  t={t}
                  onViewLogs={onViewLogs}
                  onCopyText={onCopyText}
                />
              ))}
            </div>
          </Card>

          {totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              hasPrev={currentPage > 1}
              hasNext={currentPage < totalPages}
              disabled={isLoading}
              t={t}
              onPrev={() => onPageChange(Math.max(1, currentPage - 1))}
              onNext={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            />
          )}
        </div>
      )}
    </div>
  );
}
