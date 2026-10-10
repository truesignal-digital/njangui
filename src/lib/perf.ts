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

let appStart: PerfSpan | null = null;

/** Called once from app/_layout.tsx, right after Sentry.init. */
export function beginAppStart() {
  appStart ??= startSpan('app.start.home');
}

/**
 * Home reports 'home' on its first render with Convex data. A start that
 * detours through sign-in reports 'abandoned' and sends nothing, so the
 * budget only sees real cold starts.
 */
export function endAppStart(outcome: 'home' | 'abandoned') {
  if (outcome === 'home') appStart?.end();
  appStart = null;
}
