import * as React from 'react';
import type { Locale, TranslateFn } from '@/i18n';
import type { ThemeMode } from '@/theme';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export interface AuthShellProps {
  theme: ThemeMode;
  locale: Locale;
  t: TranslateFn;
  onThemeToggle: () => void;
  onLocaleChange: (locale: Locale) => void;
  children: React.ReactNode;
}

export function AuthShell({
  theme,
  locale,
  t,
  onThemeToggle,
  onLocaleChange,
  children,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6">
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
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-12">{children}</main>
    </div>
  );
}
