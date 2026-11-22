import type { TranslateFn } from '@/i18n';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';

export interface LoginViewProps {
  oauthEnabled: boolean;
  prefix: string;
  errorMessage: string | null;
  t: TranslateFn;
  onDiscordLogin: () => void;
}

export function LoginView({
  oauthEnabled,
  prefix,
  errorMessage,
  t,
  onDiscordLogin,
}: LoginViewProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-[2px] bg-accent text-fg-on-accent">
          <Icon name="headphones" size="lg" />
        </div>
        <div>
          <CardTitle className="text-xl">{t('auth.title')}</CardTitle>
          <CardDescription className="mt-1 text-sm">{t('auth.subtitle')}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

        {oauthEnabled && (
          <Button variant="primary" size="lg" className="w-full" onClick={onDiscordLogin}>
            <Icon name="user" size="sm" />
            <span>{t('auth.discordButton')}</span>
          </Button>
        )}

        {oauthEnabled && <Separator />}

        <div className="rounded-[2px] border border-border bg-subtle p-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
            <Icon name="sparkles" size="sm" className="text-accent" />
            <span>{t('auth.instantTitle')}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">
            {t('auth.instantDescription', {
              slashCmd: '/web',
              prefixCmd: `${prefix}web`,
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
