import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';

export interface SidebarNavItem<T extends string = string> {
  id: T;
  label: string;
  icon: IconName;
}

export interface SidebarNavProps<T extends string = string> {
  title?: string;
  items: ReadonlyArray<SidebarNavItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function SidebarNav<T extends string = string>({
  title,
  items,
  activeId,
  onSelect,
  className,
}: SidebarNavProps<T>) {
  return (
    <nav
      aria-label={title}
      className={cn('rounded-[2px] border border-border bg-surface p-2', className)}
    >
      {title && (
        <div className="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          {title}
        </div>
      )}
      <div className="flex flex-row gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-[2px] border-l-2 px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                active
                  ? 'border-l-accent bg-accent-subtle font-semibold text-accent-fg'
                  : 'border-l-transparent text-fg-secondary hover:bg-subtle hover:text-fg-primary'
              )}
            >
              <Icon name={item.icon} size="sm" />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
