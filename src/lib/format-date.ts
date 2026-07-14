import { toIntlLocale } from './app-locale';

/**
 * Human date+time for ledger metadata. Always locale-driven — a bare
 * toLocaleString() freezes to the device locale and ignores the in-app
 * FR/EN toggle (footgun 6).
 */
export function formatDateTime(ts: number, language: string): string {
  return new Date(ts).toLocaleString(toIntlLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
