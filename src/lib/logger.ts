/*
 * Minimal logging seam. Dev: console. Prod: no-op until a crash reporter
 * lands — when it does, swap the transport here, not the call sites.
 * Titles must be constant strings so a future reporter can group events;
 * put the variable parts (error, ids) in meta. Never log amounts next to
 * user identifiers.
 */
type LogMeta = Record<string, unknown>;

type Transport = (level: 'debug' | 'info' | 'warn' | 'error', title: string, meta?: LogMeta) => void;

const devTransport: Transport = (level, title, meta) => {
  // eslint-disable-next-line no-console
  const fn = level === 'debug' ? console.log : console[level];
  if (meta !== undefined) fn(`[${level}] ${title}`, meta);
  else fn(`[${level}] ${title}`);
};

const noopTransport: Transport = () => {};

const transport: Transport = __DEV__ ? devTransport : noopTransport;

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
