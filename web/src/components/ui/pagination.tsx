import type { TranslateFn } from '@/i18n';
import { cn } from '@/utils/cn';
import { Button } from './button';
import { Icon } from './icon';

export interface PaginationProps {
  page: number;
  totalPages?: number;
  hasPrev: boolean;
  hasNext: boolean;
  disabled?: boolean;
  t: TranslateFn;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  hasPrev,
  hasNext,
  disabled = false,
  t,
  onPrev,
  onNext,
  className,
}: PaginationProps) {
  const label =
    totalPages !== undefined && totalPages > 0
      ? t('pagination.pageOf', { page, total: totalPages })
      : t('pagination.page', { page });

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t border-border pt-2.5',
        className
      )}
    >
      <span className="text-xs font-medium tabular-nums text-fg-secondary">{label}</span>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !hasPrev}
          onClick={onPrev}
          title={t('pagination.prev')}
          aria-label={t('pagination.prev')}
        >
          <Icon name="chevron-left" size="xs" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !hasNext}
          onClick={onNext}
          title={t('pagination.next')}
          aria-label={t('pagination.next')}
        >
          <Icon name="chevron-right" size="xs" />
        </Button>
      </div>
    </div>
  );
}
