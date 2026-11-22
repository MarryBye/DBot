import type { Locale, TextCode, TranslateFn } from '@/i18n';
import type { AuditLogFilterAction, AuditLogQueryResult } from '@/types/api';
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
import { LogEntryCard } from './log-entry-card';

const ACTION_OPTIONS: Array<{ value: AuditLogFilterAction; labelCode: TextCode }> = [
  { value: 'all', labelCode: 'logs.allActions' },
  { value: 'summon', labelCode: 'logs.action.summon' },
  { value: 'add_tracks', labelCode: 'logs.action.add_tracks' },
  { value: 'remove_tracks', labelCode: 'logs.action.remove_tracks' },
  { value: 'play_now', labelCode: 'logs.action.play_now' },
  { value: 'skip', labelCode: 'logs.action.skip' },
  { value: 'clear_queue', labelCode: 'logs.action.clear_queue' },
  { value: 'stop', labelCode: 'logs.action.stop' },
  { value: 'loop', labelCode: 'logs.action.loop' },
  { value: 'playback', labelCode: 'logs.action.playback' },
  { value: 'settings_update', labelCode: 'logs.action.settings_update' },
  { value: 'cookies_update', labelCode: 'logs.action.cookies_update' },
];

export interface LogsSectionProps {
  result: AuditLogQueryResult | null;
  isLoading: boolean;
  actionFilter: AuditLogFilterAction;
  actorIdFilter: string;
  userQuery: string;
  expandedIds: Set<number>;
  locale: Locale;
  t: TranslateFn;
  onActionFilterChange: (action: AuditLogFilterAction) => void;
  onActorIdFilterChange: (actorId: string) => void;
  onUserQueryChange: (query: string) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onToggleExpand: (id: number) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
  onCopyText: (value: string) => void;
}

export function LogsSection({
  result,
  isLoading,
  actionFilter,
  actorIdFilter,
  userQuery,
  expandedIds,
  locale,
  t,
  onActionFilterChange,
  onActorIdFilterChange,
  onUserQueryChange,
  onResetFilters,
  onRefresh,
  onPageChange,
  onToggleExpand,
  onOpenLink,
  onCopyLink,
  onCopyText,
}: LogsSectionProps) {
  const hasFilters =
    actionFilter !== 'all' || actorIdFilter !== 'all' || userQuery.trim().length > 0;
  const entries = result?.entries ?? [];
  const actors = result?.actors ?? [];
  const currentPage = result?.page ?? 1;
  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <SectionHeader
            title={t('logs.title')}
            count={result?.total}
            description={t('logs.description')}
            actions={
              <>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={onResetFilters}>
                    <Icon name="rotate-ccw" size="xs" />
                    <span>{t('logs.resetFilters')}</span>
                  </Button>
                )}
                <Button variant="secondary" size="sm" disabled={isLoading} onClick={onRefresh}>
                  <Icon
                    name="refresh-cw"
                    size="xs"
                    className={isLoading ? 'animate-spin' : undefined}
                  />
                  <span>{t('logs.refresh')}</span>
                </Button>
              </>
            }
          />
        </CardHeader>

        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Search strictly by real Discord @username or user ID */}
            <div className="relative min-w-0">
              <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
                <Icon name="search" size="xs" />
              </div>
              <Input
                value={userQuery}
                placeholder={t('logs.searchPlaceholder')}
                autoComplete="off"
                className="pl-8 pr-8"
                onChange={(e) => onUserQueryChange(e.target.value)}
              />
              {userQuery && (
                <button
                  type="button"
                  aria-label={t('logs.resetFilters')}
                  onClick={() => onUserQueryChange('')}
                  className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[2px] text-fg-muted hover:bg-subtle hover:text-fg-primary"
                >
                  <Icon name="x" size="xs" />
                </button>
              )}
            </div>

            {/* Action filter */}
            <Select
              value={actionFilter}
              onValueChange={(value) => onActionFilterChange(value as AuditLogFilterAction)}
            >
              <SelectTrigger aria-label={t('logs.filterAction')}>
                <SelectValue placeholder={t('logs.filterAction')} />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelCode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* User filter showing real @username */}
            <Select value={actorIdFilter} onValueChange={onActorIdFilterChange}>
              <SelectTrigger aria-label={t('logs.filterUser')}>
                <SelectValue placeholder={t('logs.filterUser')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('logs.allUsers')}</SelectItem>
                {actors.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {`${actor.displayName} (@${actor.username})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-[2px] border border-border bg-surface py-12">
          <Spinner size="md" />
          <p className="text-xs text-fg-muted">{t('logs.loading')}</p>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="scroll-text"
          title={hasFilters ? t('logs.emptyFilteredTitle') : t('logs.emptyTitle')}
          description={hasFilters ? t('logs.emptyFilteredDescription') : t('logs.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <LogEntryCard
                key={entry.id}
                entry={entry}
                isExpanded={expandedIds.has(entry.id)}
                locale={locale}
                t={t}
                onToggleExpand={onToggleExpand}
                onFilterByActor={(actorId) => {
                  onActorIdFilterChange(actorId);
                }}
                onOpenLink={onOpenLink}
                onCopyLink={onCopyLink}
                onCopyText={onCopyText}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              hasPrev={currentPage > 1}
              hasNext={currentPage < totalPages}
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
