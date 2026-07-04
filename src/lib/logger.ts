/*
 * Minimal logging seam. Dev: console. Prod: Sentry (init in app/_layout.tsx).
 * Titles must be constant strings so the reporter groups events;
 * put the variable parts (error, ids) in meta. Never log amounts next to
 * user identifiers.
 */
import * as Sentry from '@sentry/react-native';

type LogMeta = Record<string, unknown>;

type Transport = (level: 'debug' | 'info' | 'warn' | 'error', title: string, meta?: LogMeta) => void;

const devTransport: Transport = (level, title, meta) => {
  // eslint-disable-next-line no-console
  const fn = level === 'debug' ? console.log : console[level];
  if (meta !== undefined) fn(`[${level}] ${title}`, meta);
  else fn(`[${level}] ${title}`);
};

const sentryTransport: Transport = (level, title, meta) => {
  if (level === 'debug') return;
  // Offline failures are expected on this user base — breadcrumb, not event.
  if (meta?.error instanceof Error && isNetworkError(meta.error)) {
    Sentry.addBreadcrumb({ level: 'warning', message: title });
    return;
  }
  if (level === 'error' && meta?.error instanceof Error) {
    // Constant title becomes the group; the thrown error rides along.
    Sentry.captureException(meta.error, { tags: { title }, extra: meta });
    return;
  }
  if (level === 'error' || level === 'warn') {
    // Sentry's severity scale says 'warning', not 'warn'.
    Sentry.captureMessage(title, { level: level === 'warn' ? 'warning' : 'error', extra: meta });
    return;
  }
  Sentry.addBreadcrumb({ level, message: title, data: meta });
};

const transport: Transport = __DEV__ ? devTransport : sentryTransport;

export const logger = {
  debug: (title: string, meta?: LogMeta) => transport('debug', title, meta),
  info: (title: string, meta?: LogMeta) => transport('info', title, meta),
  warn: (title: string, meta?: LogMeta) => transport('warn', title, meta),
  error: (title: string, meta?: LogMeta) => transport('error', title, meta),
};

/**
 * Offline / connectivity failures are expected on this user base and must
 * not be reported or shown as bugs. Classification by message is the best
 * RN offers (fetch throws bare TypeErrors).
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /network|fetch|timeout|abort|offline|ECONNREFUSED|ETIMEDOUT/i.test(err.message);
}
