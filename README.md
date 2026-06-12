# Njangi

Custody-free njangi/tontine ledger for Cameroon — the njangi operating system with Cash App polish.

**Custody-free in one line:** the app NEVER moves, holds, or instructs movement of member money via any payment API — money moves wallet-to-wallet on MTN MoMo / Orange Money or as physical cash; the app is scheduler + ledger + proof + reminders.

## Mobile-only (locked decision, 2026-06-11)

Njangi is an **Expo (React Native) app targeting Android and iOS from day one** via EAS. There is no web frontend. WhatsApp shares are plain text + store/deep link (`njangi://` scheme now, `https` universal links later). Push notifications use `expo-notifications`. USSD instructions deep-link the dialer (`tel:` URL with encoded `#`). The Convex backend (`convex/`) is unchanged and framework-agnostic.

## Stack

Expo SDK 56 + expo-router + NativeWind (Tailwind v3 tokens from `src/lib/mobile-ui-config.json`) + Convex + Clerk (`@clerk/expo`, phone-first) + i18next (fr default, en) + Bun. Conventions copied from the piol mobile app (`piol-vite/apps/mobile`) — match them.

## Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Run the Convex backend** (deployment `resolute-rooster-437` already exists; `bunx convex dev` creates one if you start fresh — do NOT reuse piol's)

   ```bash
   bunx convex dev
   ```

   The deployment URL goes in `.env.local` as `EXPO_PUBLIC_CONVEX_URL` (see `.env.example`).

3. **Set up Clerk**
   - Create a Clerk application with **phone number** as the primary identifier (SMS OTP — verify delivery on real MTN and Orange Cameroon SIMs early, see docs/05-mvp-plan.md Week 1).
   - Put `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.local`.
   - Add a webhook endpoint `https://<convex-deployment>.convex.site/clerk-webhook` (events: `user.created`, `user.updated`, `user.deleted`) and set `CLERK_WEBHOOK_SECRET` + `CLERK_JWT_ISSUER_DOMAIN` in the Convex Dashboard environment variables.

4. **Run the app** (Clerk's native module requires a development build — Expo Go will not work)

   ```bash
   bunx expo start          # Metro only (needs an installed dev client)
   bun run ios              # build + run iOS simulator (applies Clerk keychain patch)
   bun run android          # build + run Android
   ```

## EAS builds

```bash
bun run eas:build:development:ios          # iOS device dev client
bun run eas:build:development:simulator    # iOS simulator dev client
bun run eas:build:development:android      # Android dev client
bun run eas:build:preview:android          # internal APK
npx eas-cli@latest build -p all --profile production
```

Profiles live in `eas.json` (copied from piol mobile). Bundle ids: `com.truesignal.njangi` on both platforms; scheme `njangi`.

## Useful commands

```bash
bun run typecheck    # TypeScript check
bun run doctor       # expo-doctor
```

## Docs

The spec lives in [`docs/`](docs/):

- [`00-overview.md`](docs/00-overview.md) — locked decisions (read first; the custody-free red line is decision 1)
- [`01-domain-model.md`](docs/01-domain-model.md) — schema source of truth
- [`02-lifecycle-state-machines.md`](docs/02-lifecycle-state-machines.md) — lifecycle/timers source of truth
- [`03-screens-ux.md`](docs/03-screens-ux.md) — route tree, wireframes, copy guide
- [`04-non-functional.md`](docs/04-non-functional.md) — regulatory, security, offline, i18n
- [`05-mvp-plan.md`](docs/05-mvp-plan.md) — week-by-week build plan

`.port-reference/` holds the web screens/components salvaged before the pivot (group wizard, member list, invite share, join-by-code) — port their logic to native screens, then delete the directory.

## Red line (never cross)

No payment APIs for member money. No balances implying the app holds value. No pooling. No lending. No "send money through the app" copy. The only PSP integration ever permitted: collecting the app's OWN premium subscription fee.
