import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/utils/cn';
import { Tooltip, useHoverTooltip } from './tooltip';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[2px]',
    'text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
    'disabled:pointer-events-none disabled:opacity-45',
    'select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-fg-on-accent hover:bg-accent-hover border border-transparent',
        secondary: 'bg-subtle text-fg-primary hover:bg-hover border border-border',
        outline: 'bg-surface text-fg-primary hover:bg-subtle border border-border-strong',
        ghost: 'bg-transparent text-fg-secondary hover:bg-subtle hover:text-fg-primary border border-transparent',
        success: 'bg-success text-fg-on-accent hover:bg-success-hover border border-transparent',
        danger: 'bg-danger text-fg-on-accent hover:bg-danger-hover border border-transparent',
        'danger-ghost': 'bg-transparent text-fg-secondary hover:bg-danger-subtle hover:text-danger-fg border border-transparent',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      type = 'button',
      title,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const { open, anchorRect, close, openFromElement } = useHoverTooltip(title);

    return (
      <>
        <Comp
          ref={ref}
          type={asChild ? undefined : type}
          aria-label={props['aria-label'] ?? (title && (size === 'icon' || size === 'icon-sm') ? title : undefined)}
          className={cn(buttonVariants({ variant, size }), className)}
          onMouseEnter={(e) => {
            openFromElement(e.currentTarget);
            onMouseEnter?.(e);
          }}
          onMouseLeave={(e) => {
            close();
            onMouseLeave?.(e);
          }}
          onMouseDown={(e) => {
            close();
            onMouseDown?.(e);
          }}
          onFocus={(e) => {
            openFromElement(e.currentTarget);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            close();
            onBlur?.(e);
          }}
          {...props}
        />
        {title && <Tooltip content={title} anchorRect={anchorRect} open={open} />}
      </>
    );
  }
);
Button.displayName = 'Button';
