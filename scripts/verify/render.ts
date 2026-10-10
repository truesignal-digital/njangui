import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from './proc';
import {
  compileTimeline,
  compressCast,
  FPS,
  paneSegments,
  planReel,
  seconds,
  shotsOf,
  wrap,
  type CastFrame,
  type RunSummary,
  type Segment,
  type Shot,
  type Timeline,
} from './reel';

const W = 1920;
const H = 1080;
const PANE_TOP = 100;
const PANE_H = 940;
const CAST_H = 1280;
const BG = '0x0a0a0a';
const FG = 'white';
const MUTED = '0xa3a3a3';
const BAD = '0xf87171';
const GOOD = '0x4ade80';
const FONT = ['/System/Library/Fonts/SFNS.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((f) => existsSync(f));

export interface LoadedRun {
  dir: string;
  summary: RunSummary;
  frames: CastFrame[];
  shots: Shot[];
  /** Cast frame width / height. */
  aspect: number;
}

export function readSummary(dir: string): RunSummary {
  const file = path.join(dir, 'summary.json');
  if (!existsSync(file)) throw new Error(`${dir} has no summary.json; pass a drive run directory`);
  return JSON.parse(readFileSync(file, 'utf8')) as RunSummary;
}

/**
 * Turns recording.mp4 into the cast: only frames that differ from the one
 * before (mpdecimate), with their times, plus each beat's screenshot at the
 * same size. Cached in cast/; delete it to re-extract.
 */
export function loadRun(dir: string): LoadedRun {
  const summary = readSummary(dir);
  const castDir = path.join(dir, 'cast');
  const index = path.join(castDir, 'index.json');
  if (!existsSync(index)) {
    const recording = path.join(dir, 'recording.mp4');
    if (!existsSync(recording)) throw new Error(`${dir} has no recording.mp4; drive it with --reel`);
    mkdirSync(castDir, { recursive: true });
    // Name each kept frame by its own pts in the stream's time base: the image
    // muxer otherwise drops frames closer together than its frame rate. vfr
    // drops the odd frame simctl writes with an earlier pts than the last.
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', recording,
      '-vf', `mpdecimate,scale=-2:${CAST_H}`, '-fps_mode', 'vfr', '-enc_time_base', 'demux', '-frame_pts', '1',
      '-q:v', '3', path.join(castDir, '%d.jpg'),
    ]);
    const [num, den] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=time_base', '-of', 'csv=p=0', recording]).split('/').map(Number);
    const frames: CastFrame[] = readdirSync(castDir)
      .filter((f) => /^\d+\.jpg$/.test(f))
      .map((f) => ({ file: path.join(castDir, f), t: (Number.parseInt(f, 10) * (num ?? 1)) / (den ?? 1) }))
      .sort((x, y) => x.t - y.t);
    // Shots must match the cast frames' exact size: the concat demuxer
    // renders a mid-stream size change as black.
    const castSize = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', frames[0]?.file ?? '']).replace(',', ':');
    const shots: Record<string, string> = {};
    for (const beat of summary.beats) {
      if (beat.frame === undefined || !existsSync(beat.frame)) continue;
      const out = path.join(castDir, `shot-${beat.label}.jpg`);
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', beat.frame, '-vf', `scale=${castSize},format=yuvj420p`, '-q:v', '3', out]);
      shots[beat.label] = out;
    }
    writeFileSync(index, `${JSON.stringify({ frames, shots }, null, 2)}\n`);
  }
  const cached = JSON.parse(readFileSync(index, 'utf8')) as { frames: CastFrame[]; shots: Record<string, string> };
  const size = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', cached.frames[0]?.file ?? '']);
  const [w, h] = size.split(',').map(Number);
  return {
    dir,
    summary,
    frames: cached.frames,
    shots: shotsOf(summary, new Map(Object.entries(cached.shots))),
    aspect: (w ?? 9) / (h ?? 19.5),
  };
}

const q = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`;

class Text {
  private count = 0;
  readonly filters: string[] = [];
  constructor(private readonly dir: string) {}

  add(text: string, opts: { x: number | string; y: number | string; size: number; color?: string; from?: number; to?: number }): void {
    if (text.trim() === '') return;
    this.count += 1;
    const file = path.join(this.dir, `${String(this.count).padStart(3, '0')}.txt`);
    writeFileSync(file, text);
    const enable = opts.from === undefined ? '' : `:enable='between(t,${opts.from.toFixed(3)},${(opts.to ?? 1e9).toFixed(3)})'`;
    this.filters.push(
      `drawtext=fontfile=${q(FONT ?? '')}:textfile=${q(file)}:expansion=none:fontsize=${opts.size}:fontcolor=${opts.color ?? FG}:line_spacing=${Math.round(opts.size * 0.3)}:x=${opts.x}:y=${opts.y}${enable}`,
    );
  }
}

function ffconcat(segments: readonly Segment[], total: number): string {
  const lines = ['ffconcat version 1.0'];
  const frame = (t: number) => Math.round(t * FPS);
  segments.forEach((seg, i) => {
    const end = segments[i + 1]?.at ?? total;
    const frames = frame(end) - frame(seg.at);
    if (frames <= 0) return;
    lines.push(`file ${q(seg.file)}`, `duration ${(frames / FPS).toFixed(4)}`);
  });
  // The concat demuxer drops the last entry's duration unless the file repeats.
  const last = segments.at(-1);
  if (last !== undefined) lines.push(`file ${q(last.file)}`);
  return `${lines.join('\n')}\n`;
}

export interface ReelResult {
  video: string;
  sheet: string;
  timeline: Timeline;
}

/** Renders reel.mp4 (one run) or reel-compare.mp4 (before | after) into the after run's directory. */
export function renderReel(after: LoadedRun, opts: { before?: LoadedRun; title?: string } = {}): ReelResult {
  if (FONT === undefined) throw new Error('no font found for captions (SFNS.ttf or DejaVuSans.ttf)');
  const runs = opts.before === undefined ? [after] : [opts.before, after];
  const compare = runs.length === 2;
  const name = compare ? 'reel-compare' : 'reel';
  const work = path.join(after.dir, `${name}-work`);
  mkdirSync(path.join(work, 'text'), { recursive: true });

  const slides = planReel(after.shots, opts.before?.shots);
  if (slides.length === 0) throw new Error('the flow took no screenshots; add takeScreenshot steps with a label');
  const tracks = runs.map((r) => compressCast(r.frames, r.shots));
  const timeline = compileTimeline(
    slides.map((slide) => ({ ...slide, panes: compare ? slide.panes : [slide.panes[0]] })),
    tracks,
  );

  const paneW = Math.round((PANE_H * after.aspect) / 2) * 2;
  const gap = 60;
  const left = 140;
  const colX = left + runs.length * paneW + (runs.length - 1) * gap + 100;
  const colW = W - colX - 100;
  const charW = (size: number) => Math.max(12, Math.floor(colW / (size * 0.52)));

  const text = new Text(path.join(work, 'text'));
  const title = opts.title ?? after.summary.flow;
  const meta = `${after.summary.device.name} · ${after.summary.device.os} · signed in as ${after.summary.role}`;
  const end = timeline.endStart;
  text.add(wrap(title, charW(40)), { x: colX, y: PANE_TOP, size: 40, from: 0, to: end });
  text.add(meta, { x: colX, y: PANE_TOP + 120, size: 24, color: MUTED, from: 0, to: end });

  runs.forEach((r, i) => {
    const label = compare ? `${i === 0 ? 'Before' : 'After'} · ${r.summary.commit}` : `${r.summary.platform === 'ios' ? 'iOS' : 'Android'} · ${r.summary.commit}`;
    text.add(label, { x: left + i * (paneW + gap), y: PANE_TOP - 50, size: 26, color: MUTED, from: 0, to: end });
  });

  const captionSize = compare ? 48 : 60;
  const slideTotal = slides.length;
  timeline.steps.forEach((step, i) => {
    const from = step.start;
    const to = step.start + step.play + step.dwell;
    text.add(`Step ${i + 1} of ${slideTotal}`, { x: colX, y: PANE_TOP + 200, size: 28, color: MUTED, from, to });
    const failedPane = step.panes.find((p) => p.shot?.failed);
    const caption = failedPane?.shot === undefined ? step.caption : `Stopped at ${seconds(failedPane.shot.real)}: ${failedPane.shot.caption}`;
    text.add(wrap(caption, charW(captionSize)), { x: colX, y: PANE_TOP + 260, size: captionSize, color: step.failed ? BAD : FG, from, to });
    const clock = step.panes
      .map((p, k) => (p.shot === undefined ? undefined : `${compare ? (k === 0 ? 'Before ' : 'After ') : ''}${seconds(p.shot.real)}`))
      .filter((s): s is string => s !== undefined)
      .join('   ');
    text.add(`${clock}${compare ? '' : ' into the flow'}`, { x: colX, y: H - 140, size: 30, color: MUTED, from: from + step.play, to });
  });

  // End card: the verdict, then one row per step with its real time.
  const verdicts = runs.map((r) => (r.summary.ok ? 'PASS' : 'FAILED'));
  text.add(compare ? `Before ${verdicts[0]}   ·   After ${verdicts[1]}` : verdicts[0]!, {
    x: 140, y: 110, size: 72, color: runs.every((r) => r.summary.ok) ? GOOD : BAD, from: end,
  });
  text.add(wrap(title, 70), { x: 140, y: 210, size: 34, color: MUTED, from: end });
  const rowH = 58;
  const timeX = W - 140 - (compare ? 560 : 240);
  slides.slice(0, 12).forEach((slide, i) => {
    const shown = slide.panes.at(-1) ?? slide.panes[0];
    const caption = `${i + 1}. ${shown?.caption ?? ''}`;
    const failed = slide.panes.some((shot) => shot?.failed);
    const y = 320 + i * rowH;
    text.add(caption.length > 70 ? `${caption.slice(0, 67)}…` : caption, { x: 140, y, size: 34, color: failed ? BAD : FG, from: end });
    const times = slide.panes.map((shot, k) => {
      const value = shot === undefined ? '—' : shot.failed ? 'stopped' : seconds(shot.real);
      return compare ? `${k === 0 ? 'before' : 'after'} ${value}` : value;
    });
    text.add(times.join('    '), { x: timeX, y, size: 34, color: MUTED, from: end });
  });
  text.add(`${runs.map((r) => r.summary.commit).join(' → ')} · ${meta}`, { x: 140, y: H - 80, size: 24, color: MUTED, from: end });

  // Panes.
  const inputs: string[] = [];
  const chains: string[] = [`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${timeline.total.toFixed(3)}[bg]`];
  let base = 'bg';
  runs.forEach((r, i) => {
    const list = path.join(work, `pane-${i}.ffconcat`);
    writeFileSync(list, ffconcat(paneSegments(timeline, tracks[i]!, i), timeline.total));
    inputs.push('-f', 'concat', '-safe', '0', '-i', list);
    const x = left + i * (paneW + gap);
    chains.push(
      `[${i}:v]fps=${FPS},scale=${paneW}:${PANE_H}:force_original_aspect_ratio=decrease,pad=${paneW}:${PANE_H}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1[p${i}]`,
      `[${base}][p${i}]overlay=x=${x}:y=${PANE_TOP}:eof_action=repeat[o${i}]`,
    );
    base = `o${i}`;
  });
  chains.push(
    `[${base}]drawbox=x=0:y=0:w=${W}:h=${H}:color=${BG}:t=fill:enable='gte(t,${end.toFixed(3)})',${text.filters.join(',')}[out]`,
  );
  const script = path.join(work, 'filter.txt');
  writeFileSync(script, chains.join(';\n'));
  const video = path.join(after.dir, `${name}.mp4`);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-/filter_complex', script, '-map', '[out]',
    '-t', timeline.total.toFixed(3), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
  ]);

  const sheet = path.join(after.dir, `${name}-sheet.png`);
  renderSheet(slides, runs, sheet, work);
  return { video, sheet, timeline };
}

/** One row per run: every shot with its caption, so a reviewer can scan the flow at a glance. */
function renderSheet(slides: ReturnType<typeof planReel>, runs: readonly LoadedRun[], out: string, work: string): void {
  const cellH = 560;
  const cellW = Math.round((cellH * (runs.at(-1)?.aspect ?? 0.46)) / 2) * 2 + 24;
  const capH = 76;
  const dir = path.join(work, 'sheet');
  mkdirSync(dir, { recursive: true });
  const inputs: string[] = [];
  const chains: string[] = [];
  const rows: string[] = [];
  let n = 0;
  runs.forEach((_, r) => {
    const cells: string[] = [];
    slides.forEach((slide, s) => {
      const shot = slide.panes[runs.length === 1 ? 0 : r];
      const id = `c${r}_${s}`;
      if (shot?.file !== undefined) {
        inputs.push('-i', shot.file);
        chains.push(`[${n}:v]scale=-2:${cellH},pad=${cellW}:${cellH + capH}:(ow-iw)/2:0:color=${BG}[${id}a]`);
        n += 1;
      } else {
        chains.push(`color=c=${BG}:s=${cellW}x${cellH + capH}:d=1[${id}a]`);
      }
      const file = path.join(dir, `${id}.txt`);
      writeFileSync(file, wrap(`${s + 1}. ${shot?.failed ? 'Stopped: ' : ''}${shot?.caption ?? '—'}`, 26).split('\n').slice(0, 3).join('\n'));
      chains.push(
        `[${id}a]drawtext=fontfile=${q(FONT ?? '')}:textfile=${q(file)}:expansion=none:fontsize=20:fontcolor=${shot?.failed ? BAD : FG}:line_spacing=5:x=12:y=${cellH + 12}[${id}]`,
      );
      cells.push(`[${id}]`);
    });
    const row = `r${r}`;
    chains.push(cells.length === 1 ? `${cells[0]}null[${row}]` : `${cells.join('')}hstack=inputs=${cells.length}[${row}]`);
    rows.push(`[${row}]`);
  });
  chains.push(rows.length === 1 ? `${rows[0]}null[out]` : `${rows.join('')}vstack=inputs=${rows.length}[out]`);
  const script = path.join(dir, 'filter.txt');
  writeFileSync(script, chains.join(';\n'));
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-/filter_complex', script, '-map', '[out]', '-frames:v', '1', out]);
}
