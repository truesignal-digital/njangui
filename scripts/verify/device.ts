import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { run, sleep } from './proc';
import { BUNDLE_ID, REPO_ROOT, type Platform } from './slot';

export interface Device {
  platform: Platform;
  /** simctl UDID or adb serial. */
  id: string;
  name: string;
  os: string;
}

const ADB = existsSync(path.join(homedir(), 'Library/Android/sdk/platform-tools/adb'))
  ? path.join(homedir(), 'Library/Android/sdk/platform-tools/adb')
  : 'adb';

export const adb = (serial: string, args: readonly string[], allowFail = false) => run(ADB, ['-s', serial, ...args], { allowFail });

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

/** A booted iPhone simulator (booting `want`, or iPhone 17 Pro, when none is). */
export async function iosDevice(want?: string): Promise<Device> {
  const raw = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])) as { devices: Record<string, SimDevice[]> };
  const all = Object.entries(raw.devices).flatMap(([runtime, list]) =>
    list.map((d) => ({ ...d, os: runtime.replace(/^.*SimRuntime\./, '').replace(/-/g, '.').replace(/^iOS\./, 'iOS ') })),
  );
  const phones = all.filter((d) => d.name.startsWith('iPhone'));
  const pick =
    (want === undefined ? undefined : all.find((d) => d.udid === want || d.name === want)) ??
    (want === undefined ? phones.find((d) => d.state === 'Booted') : undefined) ??
    phones.filter((d) => d.name === 'iPhone 17 Pro').at(-1) ??
    phones.at(-1);
  if (pick === undefined) throw new Error(want === undefined ? 'no iPhone simulator is installed' : `no simulator named ${want}`);
  if (pick.state !== 'Booted') {
    run('xcrun', ['simctl', 'boot', pick.udid], { allowFail: true });
    run('xcrun', ['simctl', 'bootstatus', pick.udid, '-b']);
  }
  return { platform: 'ios', id: pick.udid, name: pick.name, os: pick.os };
}

/** The first running emulator or device adb sees (`want` picks a serial). */
export function androidDevice(want?: string): Device {
  const serials = run(ADB, ['devices'])
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial ?? '');
  const id = want === undefined ? serials[0] : serials.find((s) => s === want);
  if (id === undefined) {
    throw new Error('no Android emulator is running. Start one: ~/Library/Android/sdk/emulator/emulator -avd routiq-field');
  }
  const name = adb(id, ['emu', 'avd', 'name'], true).split('\n')[0]?.trim() || adb(id, ['shell', 'getprop', 'ro.product.model']);
  return { platform: 'android', id, name, os: `Android ${adb(id, ['shell', 'getprop', 'ro.build.version.release'])}` };
}

export function isInstalled(device: Device): boolean {
  if (device.platform === 'ios') return run('xcrun', ['simctl', 'get_app_container', device.id, BUNDLE_ID], { allowFail: true }) !== '';
  return adb(device.id, ['shell', 'pm', 'path', BUNDLE_ID], true).startsWith('package:');
}

/** The newest local debug build for the simulator, from `bun run ios`. */
export function localIosBuild(): string | undefined {
  const root = path.join(homedir(), 'Library/Developer/Xcode/DerivedData');
  if (!existsSync(root)) return undefined;
  return readdirSync(root)
    .filter((name) => name.startsWith('Njangi-'))
    .map((name) => path.join(root, name, 'Build/Products/Debug-iphonesimulator/Njangi.app'))
    .filter((app) => existsSync(app))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** The local debug APK from `bun run android`, in this checkout or the main one. */
export function localAndroidBuild(): string | undefined {
  const common = path.dirname(path.resolve(REPO_ROOT, run('git', ['rev-parse', '--git-common-dir'], { cwd: REPO_ROOT })));
  return [REPO_ROOT, common]
    .map((root) => path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'))
    .find((apk) => existsSync(apk));
}

export function install(device: Device, app: string): void {
  if (device.platform === 'ios') run('xcrun', ['simctl', 'install', device.id, app]);
  else adb(device.id, ['install', '-r', '-d', app]);
}

/** Lets the emulator reach the slot's Metro on 127.0.0.1. */
export function reversePort(device: Device, port: number, remove = false): void {
  if (device.platform !== 'android') return;
  if (remove) adb(device.id, ['reverse', '--remove', `tcp:${port}`], true);
  else adb(device.id, ['reverse', `tcp:${port}`, `tcp:${port}`]);
}

export interface Recording {
  /** Epoch seconds of the recording's first frame. */
  startedAt: number;
  stop: () => Promise<void>;
}

const ANDROID_FILE = '/sdcard/njangi-verify.mp4';

/** Records the device screen to `file` (mp4, variable frame rate). */
export async function startRecording(device: Device, file: string): Promise<Recording> {
  if (device.platform === 'ios') {
    const child = spawn('xcrun', ['simctl', 'io', device.id, 'recordVideo', '--codec=h264', '--force', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    const startedAt = await new Promise<number>((resolve, reject) => {
      let err = '';
      const timer = setTimeout(() => reject(new Error(`simctl recordVideo did not start:\n${err}`)), 15_000);
      child.stderr.on('data', (chunk: Buffer) => {
        err += chunk.toString();
        if (err.includes('Recording started')) {
          clearTimeout(timer);
          resolve(Date.now() / 1000);
        }
      });
      child.on('exit', (code) => reject(new Error(`simctl recordVideo exited ${code}:\n${err}`)));
    });
    const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
    return {
      startedAt,
      stop: async () => {
        child.kill('SIGINT');
        await exited;
      },
    };
  }
  adb(device.id, ['shell', 'rm', '-f', ANDROID_FILE], true);
  const child = spawn(ADB, ['-s', device.id, 'shell', 'screenrecord', '--bit-rate', '8000000', '--time-limit', '180', ANDROID_FILE], { stdio: 'ignore' });
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  // screenrecord prints nothing when it starts; it is writing frames well within this.
  await sleep(700);
  const startedAt = Date.now() / 1000 - 0.4;
  return {
    startedAt,
    stop: async () => {
      adb(device.id, ['shell', 'pkill', '-INT', 'screenrecord'], true);
      await Promise.race([exited, sleep(5000)]);
      // The muxer finishes after the signal; pulling early truncates the moov atom.
      await sleep(1000);
      adb(device.id, ['pull', ANDROID_FILE, file]);
      adb(device.id, ['shell', 'rm', '-f', ANDROID_FILE], true);
    },
  };
}
