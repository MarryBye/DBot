import type { ToastMessage, ToastVariant } from '@/types/api';
import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';
import { TruncatedText } from './truncated-text';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: 'border-l-accent bg-surface text-fg-primary',
  success: 'border-l-success bg-surface text-fg-primary',
  warning: 'border-l-warning bg-surface text-fg-primary',
  danger: 'border-l-danger bg-surface text-fg-primary',
};

const VARIANT_ICONS: Record<ToastVariant, { name: IconName; color: string }> = {
  info: { name: 'info', color: 'text-accent' },
  success: { name: 'check', color: 'text-success' },
  warning: { name: 'alert-triangle', color: 'text-warning' },
  danger: { name: 'alert-triangle', color: 'text-danger' },
};

export interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:w-full"
    >
      {toasts.map((toast) => {
        const iconSpec = VARIANT_ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className={cn(
              'flex min-w-0 items-start gap-2.5 overflow-hidden rounded-[2px] border border-border-strong border-l-[3px] px-3.5 py-2.5 text-sm shadow-md',
              VARIANT_CLASSES[toast.variant]
            )}
          >
            <Icon name={iconSpec.name} size="sm" className={cn('mt-0.5 shrink-0', iconSpec.color)} />
            <TruncatedText
              text={toast.message}
              lines={2}
              className="min-w-0 flex-1 leading-snug"
            />
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Close"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-fg-muted hover:bg-subtle hover:text-fg-primary"
            >
              <Icon name="x" size="xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
