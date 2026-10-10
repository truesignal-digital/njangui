import path from 'node:path';

/** One `takeScreenshot` in a flow: the moment the reel stops and captions. */
export interface Beat {
  /** The screenshot's file name without extension; pairs before/after runs. */
  label: string;
  caption: string;
  /** Epoch seconds when the screenshot was taken. */
  t: number;
  /** Absolute path of the screenshot, or undefined when Maestro wrote none. */
  frame: string | undefined;
  failed: boolean;
}

export interface FlowResult {
  ok: boolean;
  error: string | undefined;
  beats: Beat[];
}

interface Metadata {
  status?: string;
  timestamp?: number;
  duration?: number;
  sequenceNumber?: number;
  error?: { message?: string };
}

interface Entry {
  command?: Record<string, { path?: string; label?: string } | undefined>;
  metadata?: Metadata;
}

/** "02-member-pays-cash" → "Member pays cash". */
export function captionFromPath(file: string): string {
  const words = path.basename(file).replace(/\.png$/, '').replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim();
  return words === '' ? path.basename(file) : words[0]!.toUpperCase() + words.slice(1);
}

/**
 * Reads Maestro's `commands-(<flow>).json` (from `--debug-output`). Every
 * `takeScreenshot` becomes a beat; a failed command becomes a last beat that
 * shows the failure screenshot and Maestro's reason.
 */
export function parseCommands(raw: unknown, opts: { shotsDir: string; failureShot?: string }): FlowResult {
  if (!Array.isArray(raw)) throw new Error('Maestro commands file is not a list');
  const entries = (raw as Entry[])
    .filter((entry) => typeof entry?.metadata?.timestamp === 'number')
    .sort((a, b) => (a.metadata?.sequenceNumber ?? 0) - (b.metadata?.sequenceNumber ?? 0));
  const beats: Beat[] = [];
  let error: string | undefined;
  for (const entry of entries) {
    const meta = entry.metadata!;
    const end = ((meta.timestamp ?? 0) + (meta.duration ?? 0)) / 1000;
    if (meta.status === 'FAILED') {
      error = meta.error?.message?.trim() || `${Object.keys(entry.command ?? {})[0] ?? 'a step'} failed`;
      beats.push({ label: 'failed', caption: error, t: end, frame: opts.failureShot, failed: true });
      break;
    }
    const shot = entry.command?.takeScreenshotCommand;
    if (shot?.path === undefined || meta.status !== 'COMPLETED') continue;
    const file = path.resolve(opts.shotsDir, shot.path.endsWith('.png') ? shot.path : `${shot.path}.png`);
    beats.push({
      label: path.basename(file, '.png'),
      caption: shot.label?.trim() || captionFromPath(file),
      t: end,
      frame: file,
      failed: false,
    });
  }
  return { ok: error === undefined, error, beats };
}
