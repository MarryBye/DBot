import * as React from 'react';
import { cn } from '@/utils/cn';
import { Tooltip } from './tooltip';

export interface TruncatedTextProps {
  text: string;
  as?: 'span' | 'div' | 'p' | 'h3';
  lines?: 1 | 2;
  alwaysTooltip?: boolean;
  className?: string;
}

export function TruncatedText({
  text,
  as = 'span',
  lines = 1,
  alwaysTooltip = false,
  className,
}: TruncatedTextProps) {
  const ref = React.useRef<HTMLElement | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  const close = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  }, []);

  const scheduleOpen = React.useCallback(() => {
    const el = ref.current;
    if (!el || !text) return;

    const isOverflowing =
      alwaysTooltip ||
      el.scrollWidth > el.clientWidth + 1 ||
      el.scrollHeight > el.clientHeight + 1;

    if (!isOverflowing) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const current = ref.current;
      if (!current) return;
      setAnchorRect(current.getBoundingClientRect());
      setOpen(true);
    }, 220);
  }, [alwaysTooltip, text]);

  React.useEffect(() => {
    if (!open) return;
    const onDismiss = () => close();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  React.useEffect(() => () => close(), [close]);

  const Component = as;

  return (
    <>
      <Component
        ref={ref as React.RefObject<never>}
        onMouseEnter={scheduleOpen}
        onMouseLeave={close}
        onMouseDown={close}
        onFocus={scheduleOpen}
        onBlur={close}
        className={cn(
          'block min-w-0 max-w-full',
          lines === 2 ? 'line-clamp-2 break-words' : 'truncate',
          className
        )}
      >
        {text}
      </Component>
      <Tooltip content={text} anchorRect={anchorRect} open={open} />
    </>
  );
}
