import type { TranslateFn } from '@/i18n';
import { Spinner } from '@/components/ui/spinner';

export interface LoadingViewProps {
  t: TranslateFn;
}

export function LoadingView({ t }: LoadingViewProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Spinner size="lg" />
      <p className="text-sm text-fg-secondary">{t('app.loading')}</p>
    </div>
  );
}
