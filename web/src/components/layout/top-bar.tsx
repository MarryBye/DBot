import type { Locale, TranslateFn } from '@/i18n';
import type { ThemeMode } from '@/theme';
import type { ActiveWorkerState, SharedGuildInfo, UserProfile, VoiceState } from '@/types/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export interface TopBarProps {
  guildId: string | null;
  guildName: string;
  guilds: SharedGuildInfo[];
  user: UserProfile;
  voice: VoiceState;
  worker: ActiveWorkerState | null;
  availableWorkersCount: number;
  theme: ThemeMode;
  locale: Locale;
  t: TranslateFn;
  onSelectGuild: (guildId: string) => void;
  onSummonWorker: () => void;
  onThemeToggle: () => void;
  onLocaleChange: (locale: Locale) => void;
  onLogout: () => void;
}

export function TopBar({
  guildId,
  guildName,
  guilds,
  user,
  voice,
  worker,
  availableWorkersCount,
  theme,
  locale,
  t,
  onSelectGuild,
  onSummonWorker,
  onThemeToggle,
  onLocaleChange,
  onLogout,
}: TopBarProps) {
  const statusTone = voice.inVoice ? 'online' : 'danger';
  const canSwitchGuild = guilds.length > 1 && guildId !== null;

  const serverControl = canSwitchGuild ? (
    <Select value={guildId} onValueChange={onSelectGuild}>
      <SelectTrigger
        aria-label={t('app.serverSwitch')}
        className="h-7 w-auto max-w-[200px] gap-1.5 border-transparent bg-transparent px-1.5 text-xs font-medium text-fg-secondary hover:border-border hover:bg-subtle hover:text-fg-primary focus:border-focus"
      >
        <StatusIndicator
          tone={statusTone}
          label={guildName}
          className="text-fg-secondary"
        />
      </SelectTrigger>
      <SelectContent align="start">
        {guilds.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            <StatusIndicator
              tone={g.inVoice ? 'online' : 'danger'}
              label={g.name}
              className="text-fg-primary"
            />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <StatusIndicator
      tone={statusTone}
      label={guildName}
      className="px-1 text-fg-secondary"
    />
  );

  const voiceContext = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {serverControl}

      {voice.inVoice && (
        <>
          <span className="text-xs text-fg-muted">/</span>
          <span className="max-w-[180px] truncate text-xs font-semibold text-fg-primary">
            {voice.channelName}
          </span>

          <div className="ml-1 flex items-center">
            {worker ? (
              <Badge variant="accent">
                <Icon name="mic" size="xs" />
                <span>{t('agents.agentLabel', { id: worker.id })}</span>
              </Badge>
            ) : (
              <Button
                variant={availableWorkersCount > 0 ? 'success' : 'secondary'}
                size="sm"
                disabled={availableWorkersCount === 0}
                onClick={onSummonWorker}
                className="h-7 px-2.5 text-xs"
              >
                <Icon name="mic" size="xs" />
                <span>
                  {availableWorkersCount > 0
                    ? t('voice.summon', { count: availableWorkersCount })
                    : t('voice.allBusy')}
                </span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        {/* Left: Brand + Inline Server & Voice Context */}
        <div className="flex items-center justify-between gap-3 lg:min-w-0 lg:flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-accent text-fg-on-accent">
                <Icon name="headphones" size="sm" />
              </div>
              <span className="text-sm font-bold tracking-tight text-fg-primary">
                GMRS Music
              </span>
            </div>

            <div className="hidden h-5 w-px shrink-0 bg-border lg:block" />

            <div className="hidden min-w-0 lg:flex">{voiceContext}</div>
          </div>

          {/* Mobile utility controls */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <LocaleSwitcher
              locale={locale}
              ariaLabel={t('app.language')}
              onChange={onLocaleChange}
            />
            <ThemeToggle
              theme={theme}
              label={theme === 'light' ? t('app.theme.dark') : t('app.theme.light')}
              onToggle={onThemeToggle}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={onLogout}
              title={t('app.logout')}
              aria-label={t('app.logout')}
            >
              <Icon name="log-out" size="sm" />
            </Button>
          </div>
        </div>

        {/* Mobile inline server & voice status row */}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2 lg:hidden">
          {voiceContext}
        </div>

        {/* Right: Utilities & User profile (Desktop) */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <LocaleSwitcher
            locale={locale}
            ariaLabel={t('app.language')}
            onChange={onLocaleChange}
          />
          <ThemeToggle
            theme={theme}
            label={theme === 'light' ? t('app.theme.dark') : t('app.theme.light')}
            onToggle={onThemeToggle}
          />

          <div className="mx-1 h-5 w-px bg-border" />

          <div className="flex items-center gap-2 pr-1">
            <Avatar src={user.avatarUrl} alt={user.displayName} size="sm" />
            <div className="flex items-center gap-1.5">
              <span className="max-w-[140px] truncate text-sm font-medium text-fg-primary">
                {user.displayName}
              </span>
              {user.isAdmin && <Badge variant="accent">{t('app.adminBadge')}</Badge>}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            title={t('app.logout')}
          >
            <Icon name="log-out" size="xs" />
            <span>{t('app.logout')}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
