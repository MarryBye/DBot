import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export interface TooltipProps {
  content: string;
  anchorRect: DOMRect | null;
  open: boolean;
  className?: string;
}

const VIEWPORT_PADDING = 8;
const OFFSET = 6;

export function Tooltip({ content, anchorRect, open, className }: TooltipProps) {
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });

  React.useLayoutEffect(() => {
    if (!open || !anchorRect || !tipRef.current) {
      setPos((p) => (p.ready ? { ...p, ready: false } : p));
      return;
    }

    const rect = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left + anchorRect.width / 2 - rect.width / 2;
    left = Math.max(VIEWPORT_PADDING, Math.min(vw - rect.width - VIEWPORT_PADDING, left));

    let top = anchorRect.top - rect.height - OFFSET;
    if (top < VIEWPORT_PADDING) {
      top = Math.min(vh - rect.height - VIEWPORT_PADDING, anchorRect.bottom + OFFSET);
    }

    setPos({ left, top, ready: true });
  }, [open, anchorRect, content]);

  if (!open || !content || !anchorRect) return null;

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        opacity: pos.ready ? 1 : 0,
      }}
      className={cn(
        'pointer-events-none fixed z-[60] max-w-xs break-words rounded-[2px]',
        'border border-border-strong bg-surface px-2.5 py-1.5',
        'text-xs font-normal leading-snug text-fg-primary shadow-md',
        'transition-opacity duration-100',
        className
      )}
    >
      {content}
    </div>,
    document.body
  );
}
