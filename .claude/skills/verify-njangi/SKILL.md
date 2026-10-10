---
name: verify-njangi
description: "Run the real Njangi dev-client app on an iOS simulator or Android emulator, drive it with a Maestro flow, record the screen and build a captioned reel (before | after when behaviour changed) for the PR's Walkthrough video. Use before claiming a UI change works, to reproduce a bug, and for every PR that changes app/, src/, convex/ or app.json. CLI: bun run verify."
---

# Verify Njangi

`bun run verify` (`scripts/verify/`) serves this checkout's JS from its own Metro on a numbered slot, opens the installed dev client on that Metro, records the screen while a Maestro flow runs, and turns the recording into a reel. Evidence lands in `.verify/` at the checkout root (git-ignored).

Never touch the owner's Metro on 8081/8082. Slot N owns port 8100+N; the CLI refuses a port in use and only stops processes it started (by PID, from `.verify/slots/N/state.json`).

## Needs

- `maestro` (`~/.maestro/bin/maestro`), `ffmpeg`, Xcode simulators; for Android, `adb` and a running emulator. Use the ROUTIQ field-phone AVD (Pixel 4a, 2 GB): `~/Library/Android/sdk/emulator/emulator -avd routiq-field`.
- The Njangi dev client installed on the device. `up` installs the newest local iOS debug build from DerivedData when the simulator lacks it. When there is none, or the native fingerprint changed, the owner (or an agent told to) builds once with `bun run ios` / `bun run android`.
- `.env.local` in the checkout (copy it into a new worktree): Metro bundles the dev Convex and Clerk keys from it.
- `FILE_HOST_TOKEN` for `upload`.

**Android is not proven yet.** Recording, pulling and the reel work on an emulator, but Maestro's `openLink` did not bring the dev client forward there, and the only local APK (2026-09-25) rendered a blank screen on current JS. Until the follow-up issue lands, record PR reels on iOS and say "Android: not recorded (<reason>)" when a change is Android-specific.

## Launch

```bash
bun run verify up                       # slot 1, iOS; --slot N, --platform android, --device "iPhone 17 Pro"
bun run verify status
bun run verify down                     # after every session, and after a failed up
```

Metro runs with `CI=1`: no file watching, so the reel shows the code as it was at `up`. After editing, `down` then `up`.

## Drive

```bash
bun run verify drive sign-in --reel --title "What changed (#NN)"     # scripts/verify/flows/sign-in.yaml
bun run verify drive path/to/flow.yaml --role T -e GROUP=Njangi --reel
```

- `--role P|T|M` signs in with the DEV pill (président, trésorier, membre); flows read it as `${ROLE}`.
- Every flow starts with `- runFlow: _start.yaml`: it clears state and the keychain, opens the app on the slot's Metro (`${DEV_CLIENT_URL}`) and waits for the sign-in screen.
- A beat is a `takeScreenshot` with a numbered `path` (`shots/02-claim-sent`; pairs before/after runs) and a `label` (the caption, in English). Put `waitForAnimationToEnd` before it, or the beat catches a transition.
- Prefer `id:` selectors (`testID`) over text: the UI is French by default.
- A failing step still writes a reel. It stops at that step with Maestro's reason in red, and `drive` exits 1.

The run directory holds `recording.mp4`, `screenshots/shots/*.png`, `maestro/` (commands JSON, Maestro log, failure screenshot), `summary.json`, and with `--reel` `reel.mp4` plus `reel-sheet.png`.

## Reel

The reel is the PR evidence: a 1080p mp4 of the real flow, usually 10 to 25 seconds, and a contact sheet of every beat. It plays the recording up to each beat, holds the exact screenshot while the caption shows, squeezes idle stretches to 0.6 s (the clock under each caption stays real), and ends on a card with PASS/FAILED and each step's real time.

When behaviour changed, record a before run and compare:

```bash
git worktree add --detach ../njangi-before origin/develop
cp .env.local ../njangi-before/ && (cd ../njangi-before && bun install)
(cd ../njangi-before && bun run verify up --slot 2)   # needs this branch's scripts/verify; copy it over an older base
(cd ../njangi-before && bun run verify drive /abs/path/to/flow.yaml --slot 2)
bun run verify reel .verify/<after-run> --before ../njangi-before/.verify/<before-run> --title "What changed (#NN)"
(cd ../njangi-before && bun run verify down --slot 2) && git worktree remove ../njangi-before
```

Only one slot can drive a given simulator at a time; the two slots share the installed binary, so a before/after compare works for JS-only changes. A native change needs its own build per side.

Before uploading, open `reel-sheet.png` and pull a frame or two (`ffmpeg -ss 5 -i reel.mp4 -frames:v 1 check.png`) to check the captions match the screen.

## Upload and link

```bash
bun run verify upload .verify/<run>/reel.mp4 .verify/<run>/reel-sheet.png
```

Uploads are public and permanent (files.truesignaldigital.com). Check the frames show no real phone numbers, names or tokens first; dev personas are fine. Paste the printed block under `## Walkthrough video` in the PR body. GitHub does not play external video inline, so the sheet image goes with the link.

When nothing visible changed (Convex-only with no screen reading it, tooling, tests), write `Walkthrough video: not recorded (<reason>)`. The `pr-evidence` check (`scripts/pr-evidence.ts`, run from the base branch) fails a PR that changes `app/`, `src/`, `convex/` or `app.json` without one of the two, or without `## Found while testing`.

## Proof standards

- Drive the real user path: tap through the UI. Arrange preconditions with the DEV console (`dev-seed-pilot`, `dev-open-round`, …) or `bunx convex run` on the dev deployment and say so; never fake a result.
- Capture the action and the resulting state, not only the final screen. A toast is not proof; show the screen that reads the new server state.
- Money flows stay two-sided: show the claim and the counterparty's confirm, signing in as each role in turn.
- Report anything else that looked wrong under `## Found while testing`, filed as its own issue.

The pure parts (beat parsing, time compression, timeline, evidence parsing) have tests: `bun test scripts`.
