import * as React from 'react';
import { cn } from '@/utils/cn';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ id, checked, disabled = false, ariaLabel, className, onCheckedChange }, ref) => (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-45',
        checked
          ? 'border-accent bg-accent'
          : 'border-border-strong bg-subtle hover:bg-hover',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-[1px] transition-transform',
          checked
            ? 'translate-x-[17px] bg-fg-on-accent'
            : 'translate-x-[2px] bg-fg-secondary'
        )}
      />
    </button>
  )
);
Switch.displayName = 'Switch';
