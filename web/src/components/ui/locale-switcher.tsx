import { SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { cn } from '@/utils/cn';
import { Icon } from './icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface LocaleSwitcherProps {
  locale: Locale;
  ariaLabel: string;
  onChange: (locale: Locale) => void;
  className?: string;
}

export function LocaleSwitcher({
  locale,
  ariaLabel,
  onChange,
  className,
}: LocaleSwitcherProps) {
  return (
    <Select value={locale} onValueChange={(value) => onChange(value as Locale)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-8 w-auto min-w-[74px] gap-1.5 px-2 text-xs font-semibold', className)}
      >
        <Icon name="globe" size="xs" className="text-fg-muted" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_LOCALES.map((item) => (
          <SelectItem key={item.code} value={item.code}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
