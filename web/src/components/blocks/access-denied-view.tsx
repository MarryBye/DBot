import type { TranslateFn } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

export interface AccessDeniedViewProps {
  reason: string;
  t: TranslateFn;
  onLogout: () => void;
}

export function AccessDeniedView({ reason, t, onLogout }: AccessDeniedViewProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[2px] border border-danger/30 bg-danger-subtle text-danger-fg">
          <Icon name="lock" size="lg" />
        </div>
        <div>
          <CardTitle className="text-xl">{t('denied.title')}</CardTitle>
          <CardDescription className="mt-1 text-sm">{reason}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button variant="secondary" className="w-full" onClick={onLogout}>
          <Icon name="log-out" size="sm" />
          <span>{t('app.logout')}</span>
        </Button>
      </CardContent>
    </Card>
  );
}
