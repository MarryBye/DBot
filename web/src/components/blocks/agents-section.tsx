import * as React from 'react';
import type { TranslateFn } from '@/i18n';
import type { WorkerPoolState } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { AgentCard } from './agent-card';

export interface AgentsSectionProps {
  pool: WorkerPoolState;
  activeGuildId: string | null;
  t: TranslateFn;
}

export function AgentsSection({ pool, activeGuildId, t }: AgentsSectionProps) {
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const activeCount = pool.workers.filter((w) => w.isOnline && w.isInChannel).length;

  // Активные агенты сверху (сначала ваш канал), затем незанятые
  const sortedWorkers = React.useMemo(() => {
    return [...pool.workers].sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      const aActive = a.isOnline && a.isInChannel ? 1 : 0;
      const bActive = b.isOnline && b.isInChannel ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a.id - b.id;
    });
  }, [pool.workers]);

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <SectionHeader
          title={t('agents.title')}
          description={t('agents.description')}
          actions={
            <span className="text-xs font-semibold tabular-nums text-fg-secondary">
              {t('agents.summary', {
                active: activeCount,
                total: pool.totalCount,
              })}
            </span>
          }
        />
      </CardHeader>
      <CardContent className="pt-4">
        {sortedWorkers.length === 0 ? (
          <EmptyState
            icon="radio"
            title={t('agents.emptyTitle')}
            description={t('agents.emptyDescription')}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {sortedWorkers.map((worker) => (
              <AgentCard
                key={worker.id}
                worker={worker}
                activeGuildId={activeGuildId}
                isExpanded={expandedId === worker.id}
                t={t}
                onToggleExpand={(id) =>
                  setExpandedId((prev) => (prev === id ? null : id))
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
