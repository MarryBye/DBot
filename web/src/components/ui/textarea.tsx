import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[120px] w-full rounded-[2px] border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary',
          'placeholder:text-fg-muted font-mono',
          'transition-colors focus-visible:outline-none focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus',
          'disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
