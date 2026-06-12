/**
 * Locale helpers salvaged from the web app's src/i18n/config.ts.
 * njangi has no shared domain package (unlike piol's @piol/domain), so the
 * locale vocabulary lives here.
 */
export const appLocales = ['fr', 'en'] as const;
export type AppLocale = (typeof appLocales)[number];

export const defaultLocale: AppLocale = 'fr';

const localeMap: Record<AppLocale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};

export function isAppLocale(value: string): value is AppLocale {
  return appLocales.includes(value as AppLocale);
}

export function parseAppLocale(value?: string | null): AppLocale {
  if (!value) return defaultLocale;

  const normalized = value.toLowerCase();
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('en')) return 'en';

  return defaultLocale;
}

export function toIntlLocale(value: AppLocale | string): string {
  const locale = parseAppLocale(value);
  return localeMap[locale];
}
