import type { TranslateFn } from '@/i18n';
import type { AppTab } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface NavTabsProps {
  playlistsCount: number;
  busyAgentsCount: number;
  totalAgentsCount: number;
  watchViewersCount: number;
  canViewLogs: boolean;
  isAdmin: boolean;
  t: TranslateFn;
}

interface NavItemConfig {
  value: AppTab;
  icon: IconName;
  label: string;
  badge?: string;
}

export function NavTabs({
  playlistsCount,
  busyAgentsCount,
  totalAgentsCount,
  watchViewersCount,
  canViewLogs,
  isAdmin,
  t,
}: NavTabsProps) {
  const items: NavItemConfig[] = [
    { value: 'player', icon: 'music', label: t('nav.player') },
    {
      value: 'watch',
      icon: 'tv',
      label: t('nav.watch'),
      badge: watchViewersCount > 0 ? String(watchViewersCount) : undefined,
    },
    {
      value: 'playlists',
      icon: 'list-music',
      label: t('nav.playlists'),
      badge: String(playlistsCount),
    },
    { value: 'soundboard', icon: 'volume-2', label: t('nav.soundboard') },
    {
      value: 'agents',
      icon: 'radio',
      label: t('nav.agents'),
      badge: `${busyAgentsCount}/${totalAgentsCount}`,
    },
    { value: 'leaderboard', icon: 'trophy', label: t('nav.leaderboard') },
  ];

  if (canViewLogs) {
    items.push({ value: 'logs', icon: 'scroll-text', label: t('nav.logs') });
  }

  if (isAdmin) {
    items.push({ value: 'admin', icon: 'settings', label: t('nav.settings') });
  }

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TabsList className="w-full justify-start border-b-0">
          {items.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="shrink-0">
              <Icon name={item.icon} size="sm" />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <Badge variant="default" className="ml-0.5 tabular-nums">
                  {item.badge}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  );
}
