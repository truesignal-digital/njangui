import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Platform = 'ios' | 'android';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const VERIFY_DIR = path.join(REPO_ROOT, '.verify');
export const BUNDLE_ID = 'com.truesignal.njangi';
export const SCHEME = 'njangi';

/** The owner's own Metro ports. A slot never binds them. */
export const OWNER_PORTS = [8081, 8082];

/** Slot N (0-99) owns Metro port 8100 + N. */
export function metroPort(slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot > 99) throw new Error(`slot must be 0-99, got ${slot}`);
  return 8100 + slot;
}

/** The dev-client link that loads this slot's bundle. */
export function devClientUrl(port: number): string {
  return `${SCHEME}://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${port}`)}&disableOnboarding=1`;
}

export interface SlotState {
  slot: number;
  port: number;
  /** Metro's process-group leader. */
  pid: number;
  platform: Platform;
  /** simctl UDID or adb serial. */
  device: string;
  deviceName: string;
  checkout: string;
  log: string;
  startedAt: string;
}

export const slotDir = (slot: number) => path.join(VERIFY_DIR, 'slots', String(slot));
const stateFile = (slot: number) => path.join(slotDir(slot), 'state.json');

export function readSlot(slot: number): SlotState | undefined {
  const file = stateFile(slot);
  if (!existsSync(file)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || typeof (raw as SlotState).pid !== 'number') return undefined;
  return raw as SlotState;
}

export function writeSlot(state: SlotState): void {
  mkdirSync(slotDir(state.slot), { recursive: true });
  writeFileSync(stateFile(state.slot), `${JSON.stringify(state, null, 2)}\n`);
}

export function clearSlot(slot: number): void {
  rmSync(slotDir(slot), { recursive: true, force: true });
}

/** `.verify/<stamp>-<flow>-<platform>`, unique per run. */
export function newRunDir(flow: string, platform: Platform): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  let dir = path.join(VERIFY_DIR, `${stamp}-${flow}-${platform}`);
  for (let n = 2; existsSync(dir); n += 1) dir = path.join(VERIFY_DIR, `${stamp}-${flow}-${platform}-${n}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
