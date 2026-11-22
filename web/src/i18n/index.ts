import { en, type Dictionary, type TextCode } from './dictionaries/en';
import { ru } from './dictionaries/ru';
import { uk } from './dictionaries/uk';

export type Locale = 'en' | 'uk' | 'ru';
export type { TextCode };
export type TranslateParams = Record<string, string | number>;
export type TranslateFn = (code: TextCode, params?: TranslateParams) => string;

const STORAGE_KEY = 'dbot.locale';

export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
  { code: 'ru', label: 'RU' },
];

const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  uk,
  ru,
};

const DATE_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  uk: 'uk-UA',
  ru: 'ru-RU',
};

function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'en' || base === 'uk' || base === 'ru') {
    return base;
  }
  return null;
}

export function detectSystemLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
    for (const lang of candidates) {
      const matched = normalizeLocale(lang);
      if (matched) return matched;
    }
  }
  return 'en';
}

export function getInitialLocale(): Locale {
  try {
    const saved = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Fallback to system locale
  }
  return detectSystemLocale();
}

export function saveLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable
  }
}

export function translate(locale: Locale, code: TextCode, params?: TranslateParams): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  let template = dict[code] ?? DICTIONARIES.en[code] ?? code;
  if (!params) return template;
  for (const [key, value] of Object.entries(params)) {
    template = template.replaceAll(`{${key}}`, String(value));
  }
  return template;
}

export function createTranslator(locale: Locale): TranslateFn {
  return (code, params) => translate(locale, code, params);
}

export function formatDateTime(locale: Locale, value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(DATE_LOCALES[locale] ?? 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
