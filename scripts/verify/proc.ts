import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { openSync } from 'node:fs';

/** Runs a command to completion; throws with its stderr on a non-zero exit. */
export function run(cmd: string, args: readonly string[], opts: { cwd?: string; allowFail?: boolean } = {}): string {
  const result = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}:\n${(result.stderr || result.stdout).trim()}`);
  }
  return (result.stdout ?? '').trim();
}

/** Starts a long-lived process in its own process group, output to `log`. */
export function spawnDetached(cmd: string, args: readonly string[], log: string, opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): ChildProcess {
  const fd = openSync(log, 'a');
  const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  return child;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stops a process group we started (by its leader's PID, never by name). */
export async function killGroup(pid: number, timeoutMs = 5000): Promise<void> {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(100);
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when something already listens on 127.0.0.1:port. */
export function portInUse(port: number): boolean {
  return run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { allowFail: true }) !== '';
}
