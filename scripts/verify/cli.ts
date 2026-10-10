/*
 * Record the real app doing a flow, and turn the recording into a captioned
 * reel for a PR: `bun run verify <command>`. See .claude/skills/verify-njangi.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, resolveFlow, type Args } from './args';
import { parseCommands } from './beats';
import { androidDevice, install, iosDevice, isInstalled, localAndroidBuild, localIosBuild, reversePort, startRecording, type Device } from './device';
import { metroStatus, startMetro, warmBundle } from './metro';
import { isAlive, killGroup, run } from './proc';
import type { RunSummary } from './reel';
import { loadRun, renderReel } from './render';
import { clearSlot, devClientUrl, newRunDir, readSlot, REPO_ROOT, VERIFY_DIR, writeSlot, type SlotState } from './slot';

const USAGE = `bun run verify <command>

  up [--platform ios|android] [--slot N] [--device <name|udid|serial>] [--app <.app|.apk>]
      Boot the simulator (or use the running emulator), check the dev client
      is installed, start this checkout's Metro on port 8100+N.
  drive <flow> [--role P|T|M] [--reel] [--title "..."] [-e KEY=VALUE]
      Record the screen while Maestro runs scripts/verify/flows/<flow>.yaml
      (or a path). Every takeScreenshot is a beat. Writes .verify/<run>/.
  reel <run-dir> [--before <run-dir>] [--title "..."]
      Build reel.mp4 (or reel-compare.mp4) and a contact sheet from runs.
  upload <file>...
      Put files on files.truesignaldigital.com and print the PR markdown.
  status | down [--slot N]`;

async function deviceFor(platform: SlotState['platform'], want: string | undefined): Promise<Device> {
  return platform === 'ios' ? iosDevice(want) : androidDevice(want);
}

async function up(args: Args): Promise<void> {
  const existing = readSlot(args.slot);
  if (existing !== undefined && isAlive(existing.pid) && (await metroStatus(existing.port))) {
    console.log(`slot ${args.slot} is already up: Metro on ${existing.port}, ${existing.deviceName}`);
    return;
  }
  if (existing !== undefined) clearSlot(args.slot);
  const device = await deviceFor(args.platform, args.device);
  if (args.app !== undefined || !isInstalled(device)) {
    const app = args.app ?? (device.platform === 'ios' ? localIosBuild() : localAndroidBuild());
    if (app === undefined) {
      throw new Error(
        `the Njangi dev client is not installed on ${device.name}. Build it once with ` +
          (device.platform === 'ios' ? '`bun run ios`' : '`bun run android`') +
          ', then run up again.',
      );
    }
    console.log(`installing ${app}`);
    install(device, app);
  }
  console.log(`starting Metro for slot ${args.slot}…`);
  const metro = await startMetro(args.slot);
  reversePort(device, metro.port);
  writeSlot({
    slot: args.slot,
    port: metro.port,
    pid: metro.pid,
    platform: device.platform,
    device: device.id,
    deviceName: `${device.name} (${device.os})`,
    checkout: REPO_ROOT,
    log: metro.log,
    startedAt: new Date().toISOString(),
  });
  console.log(`building the ${device.platform} bundle once…`);
  await warmBundle(metro.port, device.platform);
  console.log(`slot ${args.slot} up: Metro on ${metro.port}, ${device.name} (${device.os}). Log: ${metro.log}`);
}

async function down(args: Args): Promise<void> {
  const state = readSlot(args.slot);
  if (state === undefined) {
    console.log(`slot ${args.slot} is not up`);
    return;
  }
  await killGroup(state.pid, 5000, /expo|metro|bun/i);
  if (state.platform === 'android') {
    try {
      reversePort(androidDevice(state.device), state.port, true);
    } catch {
      // emulator already gone
    }
  }
  clearSlot(args.slot);
  console.log(`slot ${args.slot} down`);
}

function status(): void {
  const dir = path.join(VERIFY_DIR, 'slots');
  const slots = existsSync(dir) ? readdirSync(dir) : [];
  if (slots.length === 0) console.log('no slots up');
  for (const slot of slots) {
    const state = readSlot(Number(slot));
    if (state === undefined) continue;
    console.log(`slot ${state.slot}: Metro ${state.port} (${isAlive(state.pid) ? 'running' : 'dead'}), ${state.deviceName}, ${state.checkout}`);
  }
}

function commit(): string {
  const sha = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
  const dirty = run('git', ['status', '--porcelain', '--', 'app', 'src', 'convex'], { cwd: REPO_ROOT }) !== '';
  return dirty ? `${sha}+edits` : sha;
}

function findFile(dir: string, test: (name: string) => boolean): string | undefined {
  if (!existsSync(dir)) return undefined;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, test);
      if (found !== undefined) return found;
    } else if (test(entry.name)) {
      return full;
    }
  }
  return undefined;
}

async function drive(args: Args): Promise<number> {
  const name = args.positional[0];
  if (name === undefined) throw new Error('drive needs a flow: bun run verify drive <flow>');
  const flow = resolveFlow(name);
  const state = readSlot(args.slot);
  if (state === undefined || !isAlive(state.pid) || !(await metroStatus(state.port))) {
    throw new Error(`slot ${args.slot} is not up. Run: bun run verify up --slot ${args.slot}`);
  }
  if (state.checkout !== REPO_ROOT) throw new Error(`slot ${args.slot} serves ${state.checkout}, not this checkout`);
  const device = await deviceFor(state.platform, state.device);
  const dir = newRunDir(path.basename(flow, '.yaml'), device.platform);
  console.log(`run: ${dir}`);

  const recording = await startRecording(device, path.join(dir, 'recording.mp4'));
  const env = { DEV_CLIENT_URL: devClientUrl(state.port), ROLE: args.role, ...args.env };
  const maestroArgs = ['--device', device.id, 'test', '--debug-output', path.join(dir, 'maestro'), '--flatten-debug-output', '--test-output-dir', dir];
  for (const [key, value] of Object.entries(env)) maestroArgs.push('-e', `${key}=${value}`);
  maestroArgs.push(flow);
  const maestro = process.env.MAESTRO_BIN ?? (existsSync(path.join(process.env.HOME ?? '', '.maestro/bin/maestro')) ? path.join(process.env.HOME ?? '', '.maestro/bin/maestro') : 'maestro');
  const code = await new Promise<number>((resolve) => {
    const child = spawn(maestro, maestroArgs, { cwd: dir, stdio: 'inherit' });
    child.on('error', (err) => {
      console.error(`could not run ${maestro}: ${err.message}`);
      resolve(127);
    });
    child.on('exit', (exit) => resolve(exit ?? 1));
  });
  await recording.stop();

  const commands = findFile(path.join(dir, 'maestro'), (n) => n.startsWith('commands-') && n.endsWith('.json'));
  if (commands === undefined) throw new Error(`Maestro wrote no commands file under ${dir}/maestro (exit ${code})`);
  const failureShot = findFile(path.join(dir, 'maestro'), (n) => n.startsWith('screenshot-') && n.endsWith('.png') && n.includes('❌'));
  const result = parseCommands(JSON.parse(readFileSync(commands, 'utf8')), { shotsDir: path.join(dir, 'screenshots'), failureShot });
  const summary: RunSummary = {
    flow: path.basename(flow, '.yaml'),
    platform: device.platform,
    device: { name: device.name, os: device.os },
    commit: commit(),
    role: args.role,
    ok: result.ok && code === 0,
    error: result.error ?? (code === 0 ? undefined : `maestro exited ${code}`),
    recordingStartedAt: recording.startedAt,
    beats: result.beats,
  };
  writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${summary.ok ? 'PASS' : `FAILED: ${summary.error}`} · ${result.beats.length} beats · ${dir}/summary.json`);
  if (args.reel) {
    const reel = renderReel(loadRun(dir), { title: args.title });
    console.log(`reel: ${reel.video} (${reel.timeline.total.toFixed(1)} s)\nsheet: ${reel.sheet}`);
  }
  return summary.ok ? 0 : 1;
}

function reel(args: Args): void {
  const dir = args.positional[0];
  if (dir === undefined) throw new Error('reel needs a run directory');
  const after = loadRun(path.resolve(dir));
  const before = args.before === undefined ? undefined : loadRun(path.resolve(args.before));
  const result = renderReel(after, { before, title: args.title });
  console.log(`reel: ${result.video} (${result.timeline.total.toFixed(1)} s)\nsheet: ${result.sheet}`);
}

const HOST = 'https://files.truesignaldigital.com';

function upload(args: Args): void {
  const token = process.env.FILE_HOST_TOKEN;
  if (!token) throw new Error('FILE_HOST_TOKEN is not set; ask the owner for it');
  if (args.positional.length === 0) throw new Error('upload needs files');
  const lines: string[] = [];
  for (const file of args.positional) {
    const name = encodeURIComponent(path.basename(file));
    // The header comes from stdin so the token never shows in `ps`.
    const result = spawnSync('curl', ['-sS', '--fail-with-body', '-X', 'PUT', '-T', file, '-H', '@-', `${HOST}/${name}`], {
      input: `X-Upload-Token: ${token}\n`,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`upload of ${file} failed: ${(result.stdout || result.stderr).trim()}`);
    const url = result.stdout.trim();
    console.log(`${file} → ${url}`);
    lines.push(/\.(mp4|mov|webm)$/i.test(file) ? `[📼 ${path.basename(file)}](${url})` : `![${path.basename(file)}](${url})`);
  }
  console.log(`\n## Walkthrough video\n\n${lines.join('\n\n')}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), process.env);
  switch (args.command) {
    case 'up':
      await up(args);
      return 0;
    case 'down':
      await down(args);
      return 0;
    case 'status':
      status();
      return 0;
    case 'drive':
      return drive(args);
    case 'reel':
      reel(args);
      return 0;
    case 'upload':
      upload(args);
      return 0;
    default:
      console.log(USAGE);
      return args.command === 'help' ? 0 : 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
