import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { isAlive, killGroup, portInUse, sleep, spawnDetached } from './proc';
import { metroPort, OWNER_PORTS, REPO_ROOT, slotDir } from './slot';

export async function metroStatus(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/status`, { signal: AbortSignal.timeout(2000) });
    return (await res.text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

/**
 * Starts this checkout's Metro on the slot's own port. CI=1 keeps it
 * non-interactive and turns off file watching, so a reel always shows the
 * code as it was at `up`: after editing, run `down` then `up`.
 */
export async function startMetro(slot: number): Promise<{ pid: number; port: number; log: string }> {
  const port = metroPort(slot);
  if (OWNER_PORTS.includes(port)) throw new Error(`port ${port} belongs to the owner's Metro`);
  if (portInUse(port)) throw new Error(`port ${port} is in use: another checkout holds slot ${slot}. Pick another --slot; never kill its processes.`);
  mkdirSync(slotDir(slot), { recursive: true });
  const log = path.join(slotDir(slot), 'metro.log');
  const child = spawnDetached('bunx', ['expo', 'start', '--dev-client', '--port', String(port)], log, {
    cwd: REPO_ROOT,
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error('could not start Metro');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await metroStatus(port)) return { pid, port, log };
    if (!isAlive(pid)) throw new Error(`Metro exited during start; see ${log}`);
    await sleep(500);
  }
  await killGroup(pid);
  throw new Error(`Metro did not answer on ${port} within 120 s; see ${log}`);
}

/** Builds the bundle once so the first app open in a drive doesn't wait a minute. */
export async function warmBundle(port: number, platform: 'ios' | 'android'): Promise<void> {
  const url = `http://localhost:${port}/node_modules/expo-router/entry.bundle?platform=${platform}&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    await res.arrayBuffer();
  } catch {
    // Best effort: the app builds it on first open anyway.
  }
}
