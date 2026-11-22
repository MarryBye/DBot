import * as React from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-9 w-full rounded-[2px] border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg-primary',
          'placeholder:text-fg-muted',
          'transition-colors focus-visible:outline-none focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus',
          'disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
