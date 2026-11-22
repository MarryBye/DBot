import * as React from 'react';
import { cn } from '@/utils/cn';
import { Icon, type IconName } from './icon';

export interface FilePickerProps {
  accept: string;
  label: string;
  fileName?: string | null;
  icon?: IconName;
  disabled?: boolean;
  required?: boolean;
  onFileSelect: (file: File | null) => void;
  className?: string;
}

export function FilePicker({
  accept,
  label,
  fileName,
  icon = 'upload',
  disabled = false,
  required = false,
  onFileSelect,
  className,
}: FilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-2 rounded-[2px] border border-border-strong bg-surface px-3 text-sm text-fg-primary transition-colors',
        'hover:bg-subtle focus-within:border-focus focus-within:ring-1 focus-within:ring-focus',
        disabled && 'pointer-events-none opacity-45',
        className
      )}
    >
      <Icon name={icon} size="sm" className="text-fg-secondary" />
      <span className="max-w-[220px] truncate">{fileName || label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        required={required}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onFileSelect(file);
        }}
      />
    </label>
  );
}
