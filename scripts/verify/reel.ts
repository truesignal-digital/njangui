import type { Beat } from './beats';
import type { Platform } from './slot';

/** One painted frame of the recording; `t` is seconds since the recording started. */
export interface CastFrame {
  file: string;
  t: number;
}

/** summary.json of a drive run. */
export interface RunSummary {
  flow: string;
  platform: Platform;
  device: { name: string; os: string };
  commit: string;
  role: string;
  ok: boolean;
  error: string | undefined;
  /** Epoch seconds of the recording's first frame. */
  recordingStartedAt: number;
  beats: Beat[];
}

/** A beat on the recording's clock, with its frame converted to the cast's size. */
export interface Shot {
  label: string;
  caption: string;
  /** Seconds since the recording started. */
  t: number;
  /** Seconds since the run's first beat: the clock shown in the reel. */
  real: number;
  file: string | undefined;
  failed: boolean;
}

export function shotsOf(summary: RunSummary, files: ReadonlyMap<string, string>): Shot[] {
  const first = summary.beats[0]?.t ?? summary.recordingStartedAt;
  return summary.beats.map((beat) => ({
    label: beat.label,
    caption: beat.caption,
    t: Math.max(0, beat.t - summary.recordingStartedAt),
    real: Math.max(0, beat.t - first),
    file: files.get(beat.label),
    failed: beat.failed,
  }));
}

export type Slide = { index: number; total: number; panes: Array<Shot | undefined> };

/**
 * One slide per shot. With a before run, shots pair up by label in the after
 * run's order; a failed before run's stop takes the first slot it never
 * reached, and labels only the before run has come last.
 */
export function planReel(after: readonly Shot[], before?: readonly Shot[]): Slide[] {
  if (before === undefined) return after.map((shot, i) => ({ index: i + 1, total: after.length, panes: [shot] }));
  const unused = [...before];
  const take = (label: string) => {
    const at = unused.findIndex((shot) => shot.label === label && !shot.failed);
    return at === -1 ? undefined : unused.splice(at, 1)[0];
  };
  const pairs: Array<[Shot | undefined, Shot | undefined]> = after.map((shot) => [shot.failed ? undefined : take(shot.label), shot]);
  for (const failed of unused.filter((shot) => shot.failed)) {
    const gap = pairs.find(([b]) => b === undefined);
    if (gap === undefined) break;
    gap[0] = failed;
    unused.splice(unused.indexOf(failed), 1);
  }
  const all: Array<[Shot | undefined, Shot | undefined]> = [...pairs, ...unused.map((shot): [Shot | undefined, Shot | undefined] => [shot, undefined])];
  return all.map((panes, i) => ({ index: i + 1, total: all.length, panes }));
}

// ---------------------------------------------------------------------------
// Time: the recording plays at real speed, except idle stretches, which play
// at MAX_GAP so a 20 s wait doesn't fill the reel. The clock stays real.

export const MAX_GAP = 0.6;

export interface Anchor {
  /** r: seconds into the recording; c: seconds on the compressed track. */
  r: number;
  c: number;
  file: string;
}

/**
 * The recording on a compressed clock. Shots are inserted at their time so a
 * dwell always holds the exact screenshot. Frames painted while a failing
 * command waited out its timeout are dropped: a blinking caret is not progress.
 */
export function compressCast(frames: readonly CastFrame[], shots: readonly Shot[]): Anchor[] {
  const waits = shots.flatMap((shot, i) => (shot.failed ? [[shots[i - 1]?.t ?? 0, shot.t] as const] : []));
  const hidden = (t: number) => waits.some(([from, to]) => t > from && t < to);
  const events = [
    ...frames.filter((frame) => !hidden(frame.t)).map((frame) => ({ t: frame.t, file: frame.file as string | undefined })),
    ...shots.map((shot) => ({ t: shot.t, file: shot.file })),
  ].sort((a, b) => a.t - b.t);
  const firstFile = events.find((event) => event.file !== undefined)?.file;
  if (firstFile === undefined) throw new Error('the recording has no frames to play');
  const anchors: Anchor[] = [];
  let r = 0;
  let c = 0;
  let file = firstFile;
  for (const event of events) {
    c += Math.min(Math.max(event.t - r, 0), MAX_GAP);
    r = Math.max(event.t, r);
    file = event.file ?? file;
    anchors.push({ r, c, file });
  }
  return anchors;
}

/** Compressed time of recording time `r`. */
export function realToTrack(anchors: readonly Anchor[], r: number): number {
  let c = 0;
  let prev = 0;
  for (const anchor of anchors) {
    if (anchor.r > r) return c + Math.min(r - prev, MAX_GAP);
    c = anchor.c;
    prev = anchor.r;
  }
  return c + Math.min(Math.max(r - prev, 0), MAX_GAP);
}

/** The frame showing at compressed time `c`. */
export function frameAt(anchors: readonly Anchor[], c: number): string {
  let file = anchors[0]?.file ?? '';
  for (const anchor of anchors) {
    if (anchor.c > c) break;
    file = anchor.file;
  }
  return file;
}

// ---------------------------------------------------------------------------
// The timeline: an intro, one step per slide (play up to the shot, then dwell
// on it with its caption), and the end card.

export const FPS = 30;
export const INTRO = 1.5;
export const DWELL = 1.8;
export const END = 4;

export interface StepPane {
  from: number;
  to: number;
  shot: Shot | undefined;
  /** This pane stopped at an earlier failed step and holds that frame. */
  stopped: boolean;
}

export interface Step {
  start: number;
  play: number;
  dwell: number;
  caption: string;
  failed: boolean;
  panes: StepPane[];
}

export interface Timeline {
  steps: Step[];
  endStart: number;
  total: number;
}

export function compileTimeline(slides: readonly Slide[], tracks: readonly (readonly Anchor[])[]): Timeline {
  const prev = tracks.map(() => 0);
  const stopped = tracks.map(() => false);
  const steps: Step[] = [];
  let t = INTRO;
  for (const slide of slides) {
    const panes = tracks.map((track, i): StepPane => {
      const from = prev[i] ?? 0;
      const shot = slide.panes[i];
      if (stopped[i] || shot === undefined) return { from, to: from, shot: undefined, stopped: stopped[i] ?? false };
      return { from, to: Math.max(from, realToTrack(track, shot.t)), shot, stopped: false };
    });
    const longest = Math.max(0.3, ...panes.map((pane) => pane.to - pane.from));
    // The first step plays only its tail: app launch and sign-in are not the point.
    const play = steps.length === 0 ? Math.min(MAX_GAP, longest) : longest;
    const shown = slide.panes.at(-1) ?? slide.panes.find((shot) => shot !== undefined);
    steps.push({
      start: t,
      play,
      dwell: DWELL,
      caption: shown?.caption ?? '',
      failed: slide.panes.some((shot) => shot?.failed === true),
      panes,
    });
    panes.forEach((pane, i) => {
      prev[i] = pane.to;
      if (pane.shot?.failed) stopped[i] = true;
    });
    t += play + DWELL;
  }
  return { steps, endStart: t, total: t + END };
}

export interface Segment {
  file: string;
  /** Output seconds where this image starts showing. */
  at: number;
}

/**
 * What one pane shows over the whole reel, as images with start times. Short
 * steps hold their last frame until the slower pane catches up, so both
 * panes reach each shot together.
 */
export function paneSegments(timeline: Timeline, track: readonly Anchor[], pane: number): Segment[] {
  const out: Segment[] = [{ file: frameAt(track, 0), at: 0 }];
  let last = out[0]!.file;
  const show = (file: string, at: number) => {
    if (file !== last) out.push({ file, at });
    last = file;
  };
  for (const step of timeline.steps) {
    const p = step.panes[pane];
    if (p === undefined) continue;
    if (!p.stopped && p.shot !== undefined) {
      const from = Math.max(p.from, p.to - step.play);
      show(frameAt(track, from), step.start);
      for (const anchor of track) {
        if (anchor.c > from && anchor.c < p.to) show(anchor.file, step.start + (anchor.c - from));
      }
    }
    show(p.shot?.file ?? last, step.start + step.play);
  }
  return out;
}

/** "12.4 s" */
export const seconds = (s: number) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;

/** Greedy word wrap for drawtext, which has none. */
export function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}
