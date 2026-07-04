/*
 * What is deployed where, in one command: `bun run release:status`.
 * Reads the pipeline's sources of truth (GitHub Actions for the backend,
 * EAS for client updates and builds) — never guesses from local state.
 */
import { execSync } from 'node:child_process';

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function json<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const short = (sha: string) => sha.slice(0, 7);
const when = (iso: string | number) => {
  const d = new Date(iso);
  // eas-cli emits locale-ish date strings in some fields — show raw over crashing.
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
};

console.log('release status — sources of truth, not local guesses\n');

// ── main tip ───────────────────────────────────────────────────────────
sh('git fetch origin main --quiet');
const mainSha = sh('git rev-parse origin/main');
const mainMsg = sh('git log -1 --format=%s origin/main');
console.log(`main            ${short(mainSha)}  ${mainMsg}`);

// ── backend: last Deploy Convex run on main ────────────────────────────
type Run = { status: string; conclusion: string; headSha: string; updatedAt: string };
const runs = json<Run[]>(
  sh(`gh run list --workflow "Deploy Convex" --branch main --limit 1 --json status,conclusion,headSha,updatedAt`),
  []
);
if (runs.length === 0) {
  console.log('backend prod    no Deploy Convex runs found (gh missing or workflow never ran)');
} else {
  const r = runs[0];
  const state = r.status === 'completed' ? r.conclusion : r.status;
  const drift =
    r.headSha === mainSha
      ? 'up to date with main'
      : 'main has newer commits (backend-touching merges auto-deploy; others never trigger)';
  console.log(`backend prod    ${short(r.headSha)}  ${state}  ${when(r.updatedAt)}  — ${drift}`);
}

// ── client: latest update per channel ──────────────────────────────────
type Update = { group: string; message: string; runtimeVersion: string; createdAt: string; platforms: string };
for (const channel of ['production', 'preview'] as const) {
  const page = json<{ currentPage: Update[] }>(
    sh(`npx eas-cli@latest update:list --branch ${channel} --limit 1 --json --non-interactive`),
    { currentPage: [] }
  );
  const u = page.currentPage[0];
  if (!u) {
    console.log(`ota ${channel.padEnd(11)} nothing published yet`);
  } else {
    console.log(
      `ota ${channel.padEnd(11)} ${when(u.createdAt)}  runtime ${short(u.runtimeVersion)}  ${u.platforms}  "${u.message}"`
    );
  }
}

// ── client: recent builds ──────────────────────────────────────────────
type Build = {
  platform: string;
  status: string;
  gitCommitHash?: string;
  completedAt?: string;
  buildProfile?: string;
};
const builds = json<Build[]>(sh(`npx eas-cli@latest build:list --limit 4 --json --non-interactive`), []);
if (builds.length === 0) {
  console.log('builds          none found');
} else {
  for (const b of builds) {
    console.log(
      `build           ${b.platform.padEnd(7)} ${(b.buildProfile ?? '?').padEnd(8)} ${b.status.padEnd(9)} ${short(
        b.gitCommitHash ?? ''
      )}  ${b.completedAt ? when(b.completedAt) : ''}`
    );
  }
}

console.log(
  '\nrollback: backend → `git revert` + merge (auto-redeploys) · ota → republish previous update · binary → none, ship forward'
);
