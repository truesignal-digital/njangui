/*
 * A PR that changes the app must show it working: a walkthrough video link
 * (a reel from `bun run verify drive … --reel`), or an explicit
 * "Walkthrough video: not recorded (<reason>)" line when nothing visible
 * changed, plus a "Found while testing" list (or "none").
 *
 * Self-contained so CI runs the base branch's copy: a PR cannot relax the
 * check that judges it. Ported from ROUTIQ tools/pr-evidence.ts.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function changesBehaviour(files: readonly string[]): boolean {
  return files.some((file) => {
    if (file === 'app.json') return true;
    if (!/^(app|src|convex)\//.test(file)) return false;
    if (file.startsWith('convex/_generated/')) return false;
    if (/\.(test|integration\.test)\.tsx?$/.test(file) || /(^|\/)__tests__\//.test(file)) return false;
    return !/\.(md|snap)$/.test(file);
  });
}

function withoutComments(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
}

/** The text under a `## Title` heading, without HTML comments. */
export function section(body: string, title: string): string | undefined {
  const lines = withoutComments(body).split('\n');
  const start = lines.findIndex((line) => new RegExp(`^#{2,3}\\s+${title}\\s*$`, 'i').test(line.trim()));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,3}\s/.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** The text after an inline `Title:` line anywhere in the body, e.g. "Found while testing: none". */
function inline(body: string, title: string): string | undefined {
  const match = new RegExp(`^\\s*(?:[-*]\\s+)?\\**${title}\\**:\\**\\s*(.*)$`, 'im').exec(withoutComments(body));
  return match?.[1]?.trim();
}

/** "not recorded" followed by a reason: "(tooling only)", ", because …", ". The change …", ": …" */
const NOT_RECORDED = /(^|\n)\s*(?:walkthrough video:\s*)?not recorded\s*(?:\(\s*[^)\s][^)]*\)|[,.:;—–-]\s*\S)/i;
const VIDEO_LINK = /https:\/\/\S+\.(?:mp4|mov|webm)\b/i;

function hasVideo(body: string): boolean {
  const candidates = [section(body, 'Walkthrough video'), section(body, 'Walkthrough'), inline(body, 'Walkthrough video')];
  return candidates.some((text) => text !== undefined && (VIDEO_LINK.test(text) || NOT_RECORDED.test(text)));
}

function hasFindings(body: string): boolean {
  const found = section(body, 'Found while testing') ?? inline(body, 'Found while testing');
  return found !== undefined && found !== '';
}

export function evidenceProblems(body: string, files: readonly string[]): string[] {
  if (!changesBehaviour(files)) return [];
  const problems: string[] = [];
  if (!hasVideo(body)) {
    problems.push(
      'Walkthrough video: under `## Walkthrough video`, link the reel (an https link to an .mp4) from `bun run verify drive <flow> --reel` and `bun run verify upload`, or, when nothing visible changed, write "Walkthrough video: not recorded (<reason>)".',
    );
  }
  if (!hasFindings(body)) {
    problems.push('Found while testing: under `## Found while testing`, list the issues you filed for anything else that looked wrong, or write "none".');
  }
  return problems;
}

/** True when run directly (resolving symlinks such as macOS /tmp), not when a test imports it. */
function isMain(): boolean {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const base = `origin/${process.env.BASE_REF ?? 'develop'}`;
  const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => file !== '');
  const problems = evidenceProblems(process.env.PR_BODY ?? '', files);
  if (problems.length > 0) {
    console.error(`This PR changes the app, so its description needs:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(changesBehaviour(files) ? 'Walkthrough evidence present.' : 'No app code changed; no walkthrough needed.');
}
