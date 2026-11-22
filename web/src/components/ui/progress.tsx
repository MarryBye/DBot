import { cn } from '@/utils/cn';

export interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-[1px] bg-subtle', className)}
    >
      <div
        className="h-full bg-accent transition-[width] duration-300 ease-linear"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
