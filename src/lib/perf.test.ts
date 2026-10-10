import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const spanEnd = mock((_endMs?: number) => {});
const startInactiveSpan = mock((_options: Record<string, unknown>) => ({ end: spanEnd }));
const debug = mock((_title: string, _meta?: Record<string, unknown>) => {});

mock.module('@sentry/react-native', () => ({ startInactiveSpan }));
mock.module('./logger', () => ({ logger: { debug } }));

const globals = globalThis as { __DEV__?: boolean };
globals.__DEV__ = false;
const { measure, startSpan } = await import('./perf');

beforeEach(() => {
  globals.__DEV__ = false;
  spanEnd.mockClear();
  startInactiveSpan.mockClear();
  debug.mockClear();
});

describe('measure', () => {
  test('returns the wrapped result and sends one span', () => {
    expect(measure('app.start.home', () => 42)).toBe(42);
    expect(startInactiveSpan).toHaveBeenCalledTimes(1);
    expect(startInactiveSpan.mock.calls[0]?.[0]).toMatchObject({ name: 'app.start.home' });
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  test('ends the span when fn throws, then rethrows', () => {
    const boom = new Error('boom');
    expect(() =>
      measure('app.start.home', () => {
        throw boom;
      })
    ).toThrow(boom);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  test('ends the span when an async fn rejects, then rejects', async () => {
    const boom = new Error('boom');
    await expect(measure('app.start.home', () => Promise.reject(boom))).rejects.toBe(boom);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  test('resolves async results and ends the span after they settle', async () => {
    await expect(measure('app.start.home', async () => 'ok')).resolves.toBe('ok');
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });
});

describe('startSpan', () => {
  test('a second end() is a no-op', () => {
    const span = startSpan('app.start.home');
    span.end();
    span.end();
    expect(startInactiveSpan).toHaveBeenCalledTimes(1);
  });

  test('dev builds log the duration through logger instead of sending', () => {
    globals.__DEV__ = true;
    startSpan('app.start.home').end();
    expect(startInactiveSpan).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0]?.[1]).toMatchObject({ name: 'app.start.home' });
  });

  test('rejects a free string as a span name', () => {
    // Never called: the line exists for the type checker below.
    const typeOnly = () =>
      // @ts-expect-error span names are a fixed union, not free strings
      startSpan('home loaded 10000 F');
    expect(typeof typeOnly).toBe('function');
  });
});

// src/**/*.test.ts is outside `bun run typecheck`, so check this file here:
// if the span-name union widened to string, the @ts-expect-error above
// would go unused and TypeScript reports TS2578.
test(
  'the span-name @ts-expect-error is load-bearing',
  () => {
    const file = fileURLToPath(import.meta.url);
    const program = ts.createProgram([file], {
      noEmit: true,
      skipLibCheck: true,
      jsx: ts.JsxEmit.ReactNative,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
      esModuleInterop: true,
      baseUrl: fileURLToPath(new URL('../..', import.meta.url)),
      paths: { '@/*': ['src/*'] },
    });
    const source = program.getSourceFile(file);
    expect(source).toBeDefined();
    const unused = program
      .getSemanticDiagnostics(source)
      .filter((diagnostic) => diagnostic.code === 2578)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(unused).toEqual([]);
  },
  60_000
);
