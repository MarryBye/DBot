import type { ThemeMode } from '@/theme';
import { Button } from './button';
import { Icon } from './icon';

export interface ThemeToggleProps {
  theme: ThemeMode;
  label: string;
  onToggle: () => void;
}

export function ThemeToggle({ theme, label, onToggle }: ThemeToggleProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size="sm" />
    </Button>
  );
}
