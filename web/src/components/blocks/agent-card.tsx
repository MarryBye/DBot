import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { PoolWorkerStatus } from '@/types/api';
import { cn } from '@/utils/cn';
import { safeHttpUrl } from '@/utils/format';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { Icon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { PlatformBadge } from '@/components/ui/platform-badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { TrackThumbnail } from '@/components/ui/track-thumbnail';
import { TruncatedText } from '@/components/ui/truncated-text';
import { UserChip } from '@/components/ui/user-chip';

const AGENT_QUEUE_PAGE_SIZE = 6;

export interface AgentCardProps {
  worker: PoolWorkerStatus;
  activeGuildId: string | null;
  isExpanded: boolean;
  t: TranslateFn;
  onToggleExpand: (workerId: number) => void;
  onOpenLink: (url: string) => void;
  onCopyLink: (url: string) => void;
}

export function AgentCard({
  worker,
  activeGuildId,
  isExpanded,
  t,
  onToggleExpand,
  onOpenLink,
  onCopyLink,
}: AgentCardProps) {
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [queuePage, setQueuePage] = React.useState(1);

  const isActive = worker.isOnline && worker.isInChannel;
  const expandable = isActive && worker.canInspect;
  const totalQueuePages = Math.max(1, Math.ceil(worker.queue.length / AGENT_QUEUE_PAGE_SIZE));

  React.useEffect(() => {
    if (queuePage > totalQueuePages) {
      setQueuePage(totalQueuePages);
    }
  }, [queuePage, totalQueuePages]);

  React.useEffect(() => {
    if (!isExpanded) {
      setQueueOpen(false);
    }
  }, [isExpanded]);

  const otherGuildName =
    worker.guildId && activeGuildId && worker.guildId !== activeGuildId && worker.guildName
      ? worker.guildName
      : null;

  const statusTone = isActive ? 'online' : 'danger';
  const statusLabel = !worker.isOnline
    ? t('agents.statusOffline')
    : !worker.isInChannel
      ? t('agents.statusIdle')
      : worker.channelName
        ? t('agents.statusInChannel', { channel: worker.channelName })
        : t('agents.statusBusy');

  const pageStart = (queuePage - 1) * AGENT_QUEUE_PAGE_SIZE;
  const visibleQueue = worker.queue.slice(pageStart, pageStart + AGENT_QUEUE_PAGE_SIZE);
  const trackLink = safeHttpUrl(worker.currentTrack?.originalUrl);

  const headerContent = (
    <div className="flex w-full min-w-0 flex-col gap-2.5 overflow-hidden sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <Avatar src={worker.avatarUrl} alt={worker.name} size="md" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm font-semibold text-fg-primary">
              {t('agents.agentLabel', { id: worker.id })}
            </span>
            {worker.isMine && <Badge variant="accent">{t('agents.yourChannel')}</Badge>}
            <StatusIndicator
              tone={statusTone}
              label={otherGuildName ? `${statusLabel} (${otherGuildName})` : statusLabel}
              className={cn('min-w-0 max-w-full', isActive ? 'text-fg-primary' : 'text-fg-muted')}
            />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-muted">
            {isActive && worker.canInspect ? (
              <>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <Icon name="users" size="xs" />
                  <span className="tabular-nums">{worker.listeners.length}</span>
                </span>
                <span className="shrink-0">/</span>
                {worker.currentTrack ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-fg-secondary">
                    <Icon
                      name={worker.isPaused ? 'pause' : 'play'}
                      size="xs"
                      className="text-accent"
                    />
                    <TruncatedText
                      text={worker.currentTrack.title || worker.currentTrack.originalUrl}
                      className="flex-1"
                    />
                  </span>
                ) : (
                  <span>{t('agents.idleTrack')}</span>
                )}
              </>
            ) : (
              <TruncatedText text={worker.tag} />
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {isActive && worker.canInspect && worker.queue.length > 0 && (
          <Badge variant="default" className="tabular-nums">
            +{worker.queue.length}
          </Badge>
        )}
        {expandable && (
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size="sm"
            className="text-fg-muted"
          />
        )}
      </div>
    </div>
  );

  return (
    <Card
      className={cn(
        'overflow-hidden',
        worker.isMine && 'border-accent border-l-[3px]',
        !isActive && 'opacity-80'
      )}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => onToggleExpand(worker.id)}
          className="flex w-full items-center p-3.5 text-left transition-colors hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex w-full items-center p-3.5">{headerContent}</div>
      )}

      {expandable && isExpanded && (
        <div className="space-y-4 border-t border-border bg-subtle/35 p-4">
          {/* Channel & Listeners */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {t('agents.channelLabel')}
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
                <Icon name="volume-2" size="sm" className="text-success" />
                <span className="truncate">{worker.channelName}</span>
                {otherGuildName && (
                  <Badge variant="outline">{otherGuildName}</Badge>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {t('agents.listenersLabel', { count: worker.listeners.length })}
              </div>
              {worker.listeners.length === 0 ? (
                <p className="text-xs text-fg-muted">{t('agents.noListeners')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {worker.listeners.map((member) => (
                    <UserChip
                      key={member.id}
                      displayName={member.displayName}
                      avatarUrl={member.avatarUrl}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Now Playing (Read-Only) */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {t('agents.nowPlayingLabel')}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQueueOpen((prev) => !prev);
                  setQueuePage(1);
                }}
              >
                <Icon name="list-music" size="xs" />
                <span>
                  {queueOpen
                    ? t('agents.hideQueue')
                    : t('agents.showQueue', { count: worker.queue.length })}
                </span>
                <Icon name={queueOpen ? 'chevron-up' : 'chevron-down'} size="xs" />
              </Button>
            </div>

            {worker.currentTrack ? (
              <ContextMenu
                items={
                  trackLink
                    ? ([
                        {
                          id: 'open',
                          label: t('ctx.openLink'),
                          icon: 'external-link',
                          onSelect: () => onOpenLink(trackLink),
                        },
                        {
                          id: 'copy',
                          label: t('ctx.copyLink'),
                          icon: 'copy',
                          onSelect: () => onCopyLink(trackLink),
                        },
                      ] satisfies ContextMenuItem[])
                    : []
                }
              >
                <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-[2px] border border-border bg-surface p-2.5">
                  <TrackThumbnail
                    src={worker.currentTrack.thumbnail}
                    alt={worker.currentTrack.title}
                    size="md"
                  />
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PlatformBadge source={worker.currentTrack.source} />
                      {worker.isPaused && (
                        <Badge variant="warning">{t('agents.pausedBadge')}</Badge>
                      )}
                    </div>
                    <div className="min-w-0 text-sm font-semibold text-fg-primary">
                      {trackLink ? (
                        <a
                          href={trackLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block min-w-0 hover:text-accent hover:underline"
                        >
                          <TruncatedText
                            text={worker.currentTrack.title || worker.currentTrack.originalUrl}
                          />
                        </a>
                      ) : (
                        <TruncatedText
                          text={worker.currentTrack.title || worker.currentTrack.originalUrl}
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                      <TruncatedText text={worker.currentTrack.author} className="shrink" />
                      {worker.currentTrack.durationFormatted && (
                        <>
                          <span className="shrink-0">/</span>
                          <span className="shrink-0 tabular-nums">
                            {worker.currentTrack.durationFormatted}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </ContextMenu>
            ) : (
              <p className="text-xs text-fg-muted">{t('agents.idleTrack')}</p>
            )}
          </div>

          {/* Read-Only Paginated Queue */}
          {queueOpen && (
            <div className="space-y-2.5 rounded-[2px] border border-border bg-surface p-3">
              {worker.queue.length === 0 ? (
                <p className="py-2 text-center text-xs text-fg-muted">
                  {t('agents.emptyQueue')}
                </p>
              ) : (
                <>
                  <div className="flex min-w-0 flex-col divide-y divide-border">
                    {visibleQueue.map((track, idx) => {
                      const globalIdx = pageStart + idx;
                      const href = safeHttpUrl(track.originalUrl);
                      const rowMenu: ContextMenuItem[] = href
                        ? [
                            {
                              id: 'open',
                              label: t('ctx.openLink'),
                              icon: 'external-link',
                              onSelect: () => onOpenLink(href),
                            },
                            {
                              id: 'copy',
                              label: t('ctx.copyLink'),
                              icon: 'copy',
                              onSelect: () => onCopyLink(href),
                            },
                          ]
                        : [];

                      return (
                        <ContextMenu
                          key={`${track.id}-${globalIdx}`}
                          items={rowMenu}
                          className="py-2 first:pt-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                            <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-fg-muted">
                              {globalIdx + 1}.
                            </span>
                            <TrackThumbnail
                              src={track.thumbnail}
                              alt={track.title}
                              size="sm"
                              className="h-8 w-8"
                            />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="min-w-0 text-xs font-medium text-fg-primary">
                                {href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block min-w-0 hover:text-accent hover:underline"
                                  >
                                    <TruncatedText text={track.title || track.originalUrl} />
                                  </a>
                                ) : (
                                  <TruncatedText text={track.title || track.originalUrl} />
                                )}
                              </div>
                              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted">
                                <PlatformBadge source={track.source} compact />
                                <TruncatedText text={track.author} className="flex-1" />
                              </div>
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                              {track.durationFormatted}
                            </span>
                          </div>
                        </ContextMenu>
                      );
                    })}
                  </div>

                  {totalQueuePages > 1 && (
                    <Pagination
                      page={queuePage}
                      totalPages={totalQueuePages}
                      hasPrev={queuePage > 1}
                      hasNext={queuePage < totalQueuePages}
                      t={t}
                      onPrev={() => setQueuePage((p) => Math.max(1, p - 1))}
                      onNext={() => setQueuePage((p) => Math.min(totalQueuePages, p + 1))}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
