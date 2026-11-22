import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';
import { Separator } from './separator';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

const CONTEXT_MENU_EVENT = 'gmrs:contextmenu-open';
const VIEWPORT_PADDING = 8;

export function ContextMenu({ items, disabled = false, className, children }: ContextMenuProps) {
  const instanceId = React.useId();
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null);
  const [adjusted, setAdjusted] = React.useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });

  const close = React.useCallback(() => {
    setCoords(null);
    setAdjusted({ left: 0, top: 0, ready: false });
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (disabled || items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    window.dispatchEvent(new CustomEvent(CONTEXT_MENU_EVENT, { detail: instanceId }));
    setAdjusted({ left: e.clientX, top: e.clientY, ready: false });
    setCoords({ x: e.clientX, y: e.clientY });
  };

  React.useLayoutEffect(() => {
    if (!coords || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = coords.x;
    let top = coords.y;

    if (left + rect.width > vw - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, vw - rect.width - VIEWPORT_PADDING);
    }
    if (top + rect.height > vh - VIEWPORT_PADDING) {
      top = Math.max(VIEWPORT_PADDING, vh - rect.height - VIEWPORT_PADDING);
    }

    setAdjusted({ left, top, ready: true });
  }, [coords]);

  React.useEffect(() => {
    if (!coords) return;

    const handleOtherOpen = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail !== instanceId) {
        close();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const handleDismiss = () => close();

    window.addEventListener(CONTEXT_MENU_EVENT, handleOtherOpen);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);

    return () => {
      window.removeEventListener(CONTEXT_MENU_EVENT, handleOtherOpen);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [coords, close, instanceId]);

  return (
    <>
      <div onContextMenu={handleContextMenu} className={cn('min-w-0', className)}>
        {children}
      </div>

      {coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              left: `${adjusted.left}px`,
              top: `${adjusted.top}px`,
              opacity: adjusted.ready ? 1 : 0,
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="fixed z-[70] min-w-[192px] max-w-[260px] rounded-[2px] border border-border-strong bg-surface p-1 text-fg-primary shadow-lg"
          >
            {items.map((item, idx) => (
              <React.Fragment key={item.id}>
                {item.separatorBefore && idx > 0 && <Separator className="my-1" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[2px] px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                    'disabled:pointer-events-none disabled:opacity-40',
                    item.destructive
                      ? 'text-danger-fg hover:bg-danger-subtle'
                      : 'text-fg-primary hover:bg-subtle'
                  )}
                >
                  {item.icon && (
                    <Icon
                      name={item.icon}
                      size="xs"
                      className={item.destructive ? 'text-danger-fg' : 'text-fg-secondary'}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
