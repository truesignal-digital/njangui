/*
 * Timing seam. Dev: durations go to logger. Built apps: one Sentry
 * transaction per span (tracing is configured in app/_layout.tsx).
 *
 * Span names are a fixed list so they can't drift or carry data. Never put
 * an amount, phone number or id in a span name or attribute.
 */
import * as Sentry from '@sentry/react-native';

import { logger } from '@/lib/logger';

const SPAN_OPS = {
  // Cold start to Home's first render with Convex data. Budget: p75 < 2 s.
  'app.start.home': 'app.start',
} as const;

export type SpanName = keyof typeof SPAN_OPS;

export type PerfSpan = { end: () => void };

function record(name: SpanName, startMs: number, endMs: number) {
  if (__DEV__) {
    logger.debug('Perf: span ended', { name, durationMs: endMs - startMs });
    return;
  }
  // Sent after the fact, so an abandoned span costs nothing. Forced to a
  // transaction so each budget can alert on its own name.
  Sentry.startInactiveSpan({
    name,
    op: SPAN_OPS[name],
    startTime: startMs,
    forceTransaction: true,
  }).end(endMs);
}

export function startSpan(name: SpanName): PerfSpan {
  const startMs = Date.now();
  let ended = false;
  return {
    end() {
      if (ended) return;
      ended = true;
      record(name, startMs, Date.now());
    },
  };
}

/** Times `fn`, sync or async; the span ends even when `fn` throws or rejects. */
export function measure<T>(name: SpanName, fn: () => T): T {
  const span = startSpan(name);
  let result: T;
  try {
    result = fn();
  } catch (error) {
    span.end();
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(span.end) as T;
  }
  span.end();
  return result;
}

// Home's route name in app/(app)/(tabs)/index.tsx. Other index screens
// carry their path (e.g. 'groups/[groupId]/index'), so this is unique.
const HOME_ROUTE = 'index';
// Older than this is a detour (sign-in, backgrounding), not a cold start.
const APP_START_MAX_MS = 30_000;

let appStart: { span: PerfSpan; startMs: number } | null = null;

/**
 * Called once from app/_layout.tsx, right after Sentry.init. The start point
 * is JS module eval, so the span undercounts native init and bundle load;
 * Sentry's own app-start span covers those.
 */
export function beginAppStart() {
  appStart ??= { span: startSpan('app.start.home'), startMs: Date.now() };
}

/**
 * RootLayout reports each focused-route change. Any route other than Home
 * (deep link, onboarding, sign-in) abandons the start, so only cold starts
 * that land on Home reach the budget.
 */
export function noteAppStartRoute(routeName: string | undefined) {
  if (routeName !== undefined && routeName !== HOME_ROUTE) endAppStart('abandoned');
}

/**
 * Home reports 'home' on its first render with Convex data. Abandoned or
 * stale starts send nothing. Later calls are no-ops.
 */
export function endAppStart(outcome: 'home' | 'abandoned') {
  if (outcome === 'home' && appStart && Date.now() - appStart.startMs <= APP_START_MAX_MS) {
    appStart.span.end();
  }
  appStart = null;
}
