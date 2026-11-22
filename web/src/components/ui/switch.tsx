import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/utils/cn';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[2px] border border-border-strong bg-subtle transition-colors',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
      'disabled:cursor-not-allowed disabled:opacity-45',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 translate-x-0.5 rounded-[1px] bg-fg-primary transition-transform',
        'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-fg-on-accent'
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
