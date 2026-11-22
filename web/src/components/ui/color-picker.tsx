import { cn } from '@/utils/cn';
import { Tooltip, useHoverTooltip } from './tooltip';

const PRESET_COLORS = [
  '#0067b8',
  '#107c10',
  '#c42b1c',
  '#ca5010',
  '#8764b8',
  '#038387',
  '#b86e00',
  '#4f5d75',
];

export interface ColorPickerProps {
  value: string;
  disabled?: boolean;
  label: string;
  className?: string;
  onChange: (color: string) => void;
}

export function ColorPicker({
  value,
  disabled = false,
  label,
  className,
  onChange,
}: ColorPickerProps) {
  const { open, anchorRect, close, openFromElement } = useHoverTooltip(label);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label
          onMouseEnter={(e) => openFromElement(e.currentTarget)}
          onMouseLeave={close}
          onMouseDown={close}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[2px] border border-border-strong bg-surface px-2.5"
        >
          <input
            type="color"
            value={value}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => onChange(e.target.value)}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
          <span className="font-mono text-xs uppercase text-fg-secondary">{value}</span>
        </label>
        <Tooltip content={label} anchorRect={anchorRect} open={open} />

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((preset) => {
            const active = value.toLowerCase() === preset.toLowerCase();
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                aria-label={preset}
                onClick={() => onChange(preset)}
                style={{ backgroundColor: preset }}
                className={cn(
                  'h-6 w-6 rounded-[2px] border transition-transform',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  'disabled:pointer-events-none disabled:opacity-45',
                  active ? 'scale-110 border-fg-primary ring-1 ring-fg-primary' : 'border-black/15 hover:scale-105'
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
