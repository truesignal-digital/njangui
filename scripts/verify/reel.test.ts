import { describe, expect, test } from 'bun:test';
import { parseArgs } from './args';
import { captionFromPath, parseCommands } from './beats';
import { compileTimeline, compressCast, DWELL, INTRO, MAX_GAP, paneSegments, planReel, realToTrack, wrap, type Shot } from './reel';

const shot = (label: string, t: number, extra: Partial<Shot> = {}): Shot => ({
  label,
  caption: label,
  t,
  real: t,
  file: `shot-${label}.jpg`,
  failed: false,
  ...extra,
});

describe('parseCommands', () => {
  const entry = (seq: number, command: object, status = 'COMPLETED', extra: object = {}) => ({
    command,
    metadata: { status, timestamp: 1_000_000 + seq * 1000, duration: 100, sequenceNumber: seq, ...extra },
  });

  test('turns screenshots into beats in run order, with labels as captions', () => {
    const raw = [
      entry(3, { takeScreenshotCommand: { path: 'shots/02-home' } }),
      entry(1, { takeScreenshotCommand: { path: 'shots/01-sign-in', label: 'Sign-in screen' } }),
      entry(2, { tapOnElement: {} }),
    ];
    const result = parseCommands(raw, { shotsDir: '/run/screenshots' });
    expect(result.ok).toBe(true);
    expect(result.beats.map((b) => [b.label, b.caption, b.t, b.frame])).toEqual([
      ['01-sign-in', 'Sign-in screen', 1001.1, '/run/screenshots/shots/01-sign-in.png'],
      ['02-home', 'Home', 1003.1, '/run/screenshots/shots/02-home.png'],
    ]);
  });

  test('a failed command ends the beats with its reason and the failure screenshot', () => {
    const raw = [
      entry(1, { takeScreenshotCommand: { path: 'shots/01-a' } }),
      entry(2, { assertConditionCommand: {} }, 'FAILED', { error: { message: 'Assertion is false: id: x is visible' } }),
      entry(3, { takeScreenshotCommand: { path: 'shots/02-b' } }, 'PENDING'),
    ];
    const result = parseCommands(raw, { shotsDir: '/run', failureShot: '/run/maestro/fail.png' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Assertion is false: id: x is visible');
    expect(result.beats.at(-1)).toEqual({
      label: 'failed', caption: 'Assertion is false: id: x is visible', t: 1002.1, frame: '/run/maestro/fail.png', failed: true,
    });
    expect(result.beats).toHaveLength(2);
  });

  test('skipped optional screenshots are not beats', () => {
    const raw = [entry(1, { takeScreenshotCommand: { path: 'a' } }, 'SKIPPED')];
    expect(parseCommands(raw, { shotsDir: '/' }).beats).toEqual([]);
  });

  test('captions fall back to the path without its number', () => {
    expect(captionFromPath('shots/03-member-pays-cash')).toBe('Member pays cash');
  });
});

describe('compressCast', () => {
  test('idle stretches play at MAX_GAP; shots sit at their own time', () => {
    const frames = [
      { file: 'a', t: 0 },
      { file: 'b', t: 0.2 },
      { file: 'c', t: 10 },
    ];
    const track = compressCast(frames, [shot('s', 5)]);
    expect(track.map((a) => [a.file, a.r, Number(a.c.toFixed(2))])).toEqual([
      ['a', 0, 0],
      ['b', 0.2, 0.2],
      ['shot-s.jpg', 5, 0.2 + MAX_GAP],
      ['c', 10, 0.2 + 2 * MAX_GAP],
    ]);
    expect(realToTrack(track, 5)).toBeCloseTo(0.2 + MAX_GAP);
  });

  test("frames painted while a failing step waited out its timeout are dropped", () => {
    const frames = [
      { file: 'a', t: 0 },
      { file: 'caret1', t: 3 },
      { file: 'caret2', t: 6 },
    ];
    const track = compressCast(frames, [shot('ok', 1), shot('failed', 9, { failed: true })]);
    expect(track.map((a) => a.file)).toEqual(['a', 'shot-ok.jpg', 'shot-failed.jpg']);
  });
});

describe('planReel', () => {
  test('pairs before and after by label; a failed before run takes the first slot it missed', () => {
    const after = [shot('01-a', 1), shot('02-b', 2), shot('03-c', 3)];
    const before = [shot('01-a', 1), shot('failed', 2, { failed: true })];
    const slides = planReel(after, before);
    expect(slides.map((s) => s.panes.map((p) => p?.label))).toEqual([
      ['01-a', '01-a'],
      ['failed', '02-b'],
      [undefined, '03-c'],
    ]);
  });
});

describe('compileTimeline', () => {
  test('both panes reach each shot together: the step plays as long as the slower pane', () => {
    const fast = [shot('01-a', 1), shot('02-b', 2)];
    const slow = [shot('01-a', 1), shot('02-b', 3)];
    const frames = [{ file: 'f', t: 0 }];
    const tracks = [compressCast(frames, slow), compressCast(frames, fast)];
    const timeline = compileTimeline(planReel(fast, slow), tracks);
    const [first, second] = timeline.steps;
    expect(first?.start).toBe(INTRO);
    expect(first?.play).toBeLessThanOrEqual(MAX_GAP);
    expect(second?.play).toBeCloseTo(MAX_GAP);
    expect(timeline.endStart).toBeCloseTo(INTRO + (first?.play ?? 0) + MAX_GAP + 2 * DWELL);

    const segments = paneSegments(timeline, tracks[1]!, 1);
    const dwell = segments.find((s) => s.file === 'shot-02-b.jpg');
    expect(dwell?.at).toBeCloseTo((second?.start ?? 0) + (second?.play ?? 0));
  });

  test('a pane that stopped holds its failure frame for the rest of the reel', () => {
    const before = [shot('01-a', 1), shot('failed', 2, { failed: true })];
    const after = [shot('01-a', 1), shot('02-b', 2), shot('03-c', 3)];
    const frames = [{ file: 'f', t: 0 }];
    const tracks = [compressCast(frames, before), compressCast(frames, after)];
    const timeline = compileTimeline(planReel(after, before), tracks);
    expect(timeline.steps[2]?.panes[0]?.stopped).toBe(true);
    const segments = paneSegments(timeline, tracks[0]!, 0);
    expect(segments.at(-1)?.file).toBe('shot-failed.jpg');
  });
});

describe('wrap', () => {
  test('breaks on words at the width', () => {
    expect(wrap('Signed in: Home shows the groups', 12)).toBe('Signed in:\nHome shows\nthe groups');
  });
});

describe('parseArgs', () => {
  test('reads flags, repeated -e and the slot from the environment', () => {
    const args = parseArgs(['drive', 'sign-in', '--reel', '--role', 't', '-e', 'A=1', '-e', 'B=x=y'], { NJANGI_VERIFY_SLOT: '4' });
    expect(args).toMatchObject({ command: 'drive', positional: ['sign-in'], reel: true, role: 'T', slot: 4, env: { A: '1', B: 'x=y' } });
  });

  test('rejects unknown options and bad values', () => {
    expect(() => parseArgs(['drive', '--nope'])).toThrow('unknown option');
    expect(() => parseArgs(['up', '--platform', 'web'])).toThrow('ios or android');
    expect(() => parseArgs(['up', '--slot', '100'])).toThrow('0-99');
  });
});
