import { existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, type Platform } from './slot';

export interface Args {
  command: string;
  positional: string[];
  slot: number;
  platform: Platform;
  device: string | undefined;
  /** A dev-client build to install before starting. */
  app: string | undefined;
  role: string;
  reel: boolean;
  title: string | undefined;
  before: string | undefined;
  env: Record<string, string>;
}

const VALUE_FLAGS = new Set(['--slot', '--platform', '--device', '--app', '--role', '--title', '--before', '-e']);

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = {}): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const extra: Record<string, string> = {};
  let reel = false;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg === '--reel') {
      reel = true;
    } else if (VALUE_FLAGS.has(arg)) {
      const value = rest[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      if (arg === '-e') {
        const eq = value.indexOf('=');
        if (eq <= 0) throw new Error(`-e takes KEY=VALUE, got ${value}`);
        extra[value.slice(0, eq)] = value.slice(eq + 1);
      } else {
        flags.set(arg, value);
      }
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const slot = Number(flags.get('--slot') ?? env.NJANGI_VERIFY_SLOT ?? 1);
  if (!Number.isInteger(slot) || slot < 0 || slot > 99) throw new Error(`--slot must be 0-99`);
  const platform = flags.get('--platform') ?? 'ios';
  if (platform !== 'ios' && platform !== 'android') throw new Error(`--platform must be ios or android`);
  const role = (flags.get('--role') ?? 'P').toUpperCase();
  if (!['P', 'T', 'M'].includes(role)) throw new Error(`--role must be P (président), T (trésorier) or M (membre)`);
  return {
    command,
    positional,
    slot,
    platform,
    device: flags.get('--device'),
    app: flags.get('--app'),
    role,
    reel,
    title: flags.get('--title'),
    before: flags.get('--before'),
    env: extra,
  };
}

export const FLOWS_DIR = path.join(REPO_ROOT, 'scripts/verify/flows');

/** `flow:sign-in` or `sign-in` → scripts/verify/flows/sign-in.yaml; anything else is a path. */
export function resolveFlow(name: string, cwd = process.cwd()): string {
  const bare = name.replace(/^flow:/, '');
  const named = path.join(FLOWS_DIR, bare.endsWith('.yaml') ? bare : `${bare}.yaml`);
  if (!bare.includes('/') && existsSync(named)) return named;
  const file = path.resolve(cwd, name);
  if (existsSync(file)) return file;
  throw new Error(`no flow ${name}: not in scripts/verify/flows/ and not a file`);
}
