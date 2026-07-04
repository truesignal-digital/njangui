<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# CLAUDE.md – Njangi Development Guide

Njangi is a mobile app for running njangi groups (rotating savings circles): members contribute per round, one member (or hand) claims the pot, and both sides confirm money movement. Trust and money-ledger correctness dominate every design decision — server truth over optimism, everywhere.

## Project Overview

**Tech stack:**

- React Native 0.85 with Expo SDK 56, **iOS + Android only** (no web target)
- expo-router (file-based routes, `experiments.typedRoutes` on)
- NativeWind 4 (Tailwind classes; custom token palette, default palette removed)
- Convex backend (reactive queries ARE the cache; no TanStack Query)
- Clerk auth via `@clerk/expo` (email/username + password, Google SSO)
- i18next with **fr (default/fallback) + en** static JSON catalogs
- react-native-reanimated 4 for animation, sonner-native for toasts
- **bun** as package manager and test runner (`bun`, `bunx` — never npm/pnpm/yarn)

## Essential Commands

```bash
# Development (two terminals)
bun run convex:dev          # Convex dev server (bunx convex dev)
bun run start:dev-client    # Expo dev server for the dev client
bun run ios                 # Build & run iOS (patches Clerk simulator keychain first)
bun run android             # Build & run Android

# Quality gate — run all three before declaring any slice done
bun run typecheck           # tsc --noEmit
bun run lint:design         # scripts/lint-design-system.ts (house rules + fr/en key parity)
bun test convex/lib         # bun:test money-math suites

bun run doctor              # npx expo-doctor
# EAS builds: bun run eas:build:development:{ios,android}, eas:build:preview:android
```

## Project Structure

```
app/                        # expo-router routes ONLY — layout + wiring, no business logic
├── +not-found.tsx          # catch-all for stale deep links
├── (auth)/                 # sign-in
└── (app)/
    ├── (tabs)/             # index (home), group, calendar, inbox, profile
    ├── groups/[groupId]/   # group detail, add-member, start-cycle, activity
    │   └── rounds/[roundId]/  # round detail, meeting, pay/ (index, ussd, claim)
    ├── payments/[paymentId].tsx
    └── join-by-code.tsx, onboarding.tsx, groups/new.tsx
src/
├── components/ui/          # Shared primitives: AppButton, Badge, SectionCard, TextField, PotProgress
├── components/<feature>/   # Feature components used by 2+ screens (e.g. groups/)
├── components/dev/         # Dev-only tooling (exempt from i18n/token rules)
├── hooks/                  # React hooks (use-pay-flow, use-push-notifications, …)
├── lib/                    # Pure helpers, theme, storage modules, mobile-ui-config.json
├── providers/              # app-providers.tsx (Clerk + Convex + theme)
└── i18n/locales/           # en.json + fr.json — must stay key-identical
convex/
├── lib/                    # Pure, unit-tested domain math + appLinks (bun:test files beside sources)
├── utils/                  # ctx-taking helpers (auth, phone, activity)
└── *.ts                    # Public queries/mutations/actions; schema.ts
scripts/lint-design-system.ts   # House-rule lint — the home for encoded conventions
```

**Where code goes** (decision procedure):
- Screens: `app/` only. Screens hold layout + wiring; money math never lives in components.
- Reusable primitives → `src/components/ui/`. Shared by 2+ screens → `src/components/<feature>/`.
- Pure helpers/formatting/theme → `src/lib/`. Hooks → `src/hooks/`. Providers → `src/providers/`.
- Convex: pure domain math in `convex/lib/` (tested), ctx helpers in `convex/utils/`, public functions in top-level `convex/*.ts`.
- Do not create new top-level `src/` directories; classify into the buckets above.

**Imports**: use `@/…` for anything under `src/` (alias in tsconfig `paths`, resolved by Expo Metro). New files never write `../../…` chains; when touching a file that has them, convert that file's imports in the same change.

**Types**: tsconfig is not yet strict. Do not add new implicit anys; annotate implicit-any params in any file you touch. Long-term ratchet target is `strict: true`.

## How We Adopt Patterns

- **Strangler, never big-bang**: a new pattern lands beside the old one, is required for new code, and old call sites migrate when touched — not in a sweep.
- **Lint over prose**: when the same review nit appears a third time, encode it as a check in `scripts/lint-design-system.ts` instead of writing a doc note.
- **Fix bug classes in the API/types**, not in reviewer memory (e.g. required `label` prop on AppButton, `satisfies` contracts on platform splits).
- **No scale machinery without the symptom**: this is a 2-dev MVP. Extract shared abstractions on the *second* concrete use, never pre-emptively.

## Styling & Theming (NativeWind)

All design tokens live in `src/lib/mobile-ui-config.json` — the single source of truth feeding two tracks:
1. **className track** (default): `tailwind.config.ts` maps tokens to semantic classes backed by CSS vars that auto-flip for dark mode. The Tailwind default palette is deliberately removed — classes like `bg-amber-100` do not exist here.
2. **JS track** (only when a prop can't take className): `useAppTheme()` / `useShadow()` from `src/lib/theme.ts` — for icon `color=`, navigation themes, ActivityIndicator, gradients.

Rules:
- Never write hex/rgb/hsl literals in components. Use semantic classes (`bg-surface`, `text-muted`, `border-border-subtle`, `text-accent`) or `theme.*` values. The only exception is `src/lib/group-colors.ts` (per-group HSL identity, already dark-aware — pass `theme.isDark`).
- Never write `dark:` variants. Dark mode is handled by the CSS-var flip (`darkMode: 'media'`); if a color looks wrong in dark, fix the dark value in `mobile-ui-config.json`, not the call site.
- A `theme.isDark ? a : b` ternary is the escape hatch for genuine one-offs. If the same pair shows up in a second component, promote it to a named token in `mobile-ui-config.json` (add to BOTH `colors.light` and `colors.dark` — they must stay key-identical).
- Spacing/radius/type: use tokens (`p-lg`, `gap-sm`, `rounded-xl`, `text-title`, `font-body-semi`). Arbitrary values like `h-[96px]` are OK for one-off dimensions (skeletons, icon boxes) but NOT for padding/gap/margin — snap those to the scale or add a token to `spacingExtras`.
- Every `<Text>` must include a `font-*` class (`font-body`, `font-body-semi`, `font-heading`, `font-mono`) — Android breaks on bare fontWeight with our static font files.
- Shadows: use `useShadow()('card')` via the `style` prop (handles dark-mode opacity), or the `shadow-card`/`shadow-floating` classes.
- Always-on colors (same in light and dark, e.g. on-scrim white) come from `mobileUiConfig.structuralColors`, not literals.
- If a dark-first redesign or theme toggle ships, switch `tailwind.config.ts` to `darkMode: 'class'` (NativeWind `colorScheme.set`) in the same PR that adds the setting — do not scatter `isDark` overrides to fake it under `darkMode: 'media'`.

## Component APIs & Overlays

- Overlays are **expo-router routes**, not imperative dialogs. Full-screen or sheet-like flows get `presentation: 'modal'` in `app/(app)/_layout.tsx`. ONE modal layer per flow — screens inside a flow (e.g. `pay/ussd`, `pay/claim`) push as cards, never modal-on-modal.
- **Never dismiss an in-screen `<Modal>` and navigate in the same tick.** `setVisible(false); router.back()` races two animations (see the `start-cycle.tsx` confirm sheet). Either navigate and let route unmount take the Modal down, or put the navigation in the Modal's `onDismiss`. Same rule for chaining: close one overlay fully before opening the next.
- In-screen RN `<Modal>` is only for overlays colocated with their caller (confirm sheets, `src/components/image-preview-modal.tsx`). If a trigger and its overlay would live in different components, make the overlay a route instead.
- Shared primitives live in `src/components/ui/` and take **flat props** — no compound/context component APIs at this app's size. Extract a shared component only on the second concrete use (a second confirm sheet → `ui/confirm-sheet.tsx`; the radio rows in `groups/new.tsx` + `payments/[paymentId].tsx` → one SelectRow with `accessibilityRole="radio"` built in).
- Accessibility is required at the type level, not the review level: interactive components take a required `label`/text prop (like AppButton); every raw `Pressable` sets `accessibilityRole`, icon-only ones set `accessibilityLabel={t(...)}`, selection rows set `accessibilityState={{selected}}`. All labels through i18next (en/fr), never literals.
- When passing an `icon` to AppButton, its color must match the variant's label color (`primary` → `theme.primaryForeground`, else `theme.accent`/foreground). If this pairing appears a third time, refactor `icon` to a render function that receives the color.

## Server State (Convex)

Convex `useQuery` subscriptions are the cache — no TanStack layer, no manual invalidation, no optimistic writes. Gate every authed query with `isAuthenticated ? args : ('skip' as const)` (see `app/(app)/(tabs)/index.tsx`).

**Queries:**
- Every function declares `args` AND `returns` validators; reuse the shared validators exported from `convex/schema.ts`.
- Always `withIndex`; reads on unbounded tables (`activityEvents`, `paymentRecords`, `confirmations`) must `.paginate()` (see `convex/activity.ts` + `usePaginatedQuery` in `src/components/groups/activity-feed.tsx`) or `.take(n)`. Never bare `.collect()` on an unbounded table.
- Keep wide-subscription queries narrow: `convex/groups.ts:listMyGroups` feeds two tabs and reruns on any membership/round write. When touching it, replace `.collect().filter().length` counting with a status-scoped index or a denormalized count maintained by the writing mutation.
- Deep-link-target queries (`getPaymentRecord`, `getGroup`) take `v.string()` + `ctx.db.normalizeId(table, arg)` returning `null` on mismatch — see Navigation below.

**Mutations:**
- Money mutations are **never optimistic** — set a `busy` flag and let the subscription deliver server truth. The ledger renders server truth only; this is deliberate for a trust app.
- Client-originated claims send an idempotency key generated ONCE per tap and reused on retry (`src/lib/idempotency.ts`).
- Denormalize deliberately and document why in `convex/schema.ts` (examples: `rounds.groupId`, `paymentRecords.confirmedAt`); the mutation that writes the source field owns updating the copy.
- `expectedForMember` is the ONLY legal source of a member's expected contribution amount (multi-hand rotations) — never recompute it ad hoc.
- **Public function signatures evolve additively** once released binaries exist: new args optional; never rename/retype/remove args or `returns` fields in one step — deprecate, ship updated clients, then remove. A Convex deploy reaches prod in minutes; installed binaries update at store speed. Mirrors the "evolve persisted shapes additively" storage rule.

**Transitions:** for instant list→detail navigation, pass already-known display fields (name, `colorSeed`) through expo-router params so the header renders while `useQuery` resolves.

**Errors:** see Errors & Observability — user-visible server errors must be `ConvexError({ code })`, never plain `Error`.

## Client State

Global state is Convex reactive queries + Clerk session + i18next. Do NOT add client-state libraries or new React contexts for data Convex can serve reactively.

- **Persisted storage**: every device-local key is declared in `src/lib/storage-keys.ts` and owned by one small module under `src/lib/` (see `app-language.ts`, `meeting-queue.ts`, `ussd-content.ts`). Never inline an AsyncStorage/SecureStore key in a screen or hook.
- **Validate at the storage boundary**: never `JSON.parse(raw) as T`. Guard the shape with a predicate and fall back to a typed default (bundled content, empty queue, device locale). `src/lib/app-language.ts` (isAppLocale check) and `src/lib/ussd-content.ts` (bundled floor + version-gated cache) are the house patterns.
- **Evolve persisted shapes additively**: new fields optional with a runtime fallback; never repurpose a key. If the payload is replayed later (like the meeting tap queue) or remotely overridden, carry a `version` field.
- **Multi-await async flows** (auth linking, queue replay): check a `live`/aborted flag after *every* await before setting state — copy the replay effect in `app/(app)/groups/[groupId]/rounds/[roundId]/meeting.tsx`. The meeting tap queue must be written *before* the mutation fires and dequeued only on server ack or a terminal verdict.
- **Platform-split modules** (`*.native.ts` / `*.web.ts`, e.g. `src/lib/clerk-client.*`): define one shared API type and assert every export in both files with `satisfies` so drift is a compile error, not a comment.
- **If a React context ever becomes necessary** (state + setters consumed widely): split it into a state context and a separately-memoized API context with two hooks (`useThing` / `useThingApi`) so setter-only consumers don't re-render on state change.

## Cross-Platform (iOS + Android only, no web)

This domain is clean — keep it that way:

- No `Platform.OS` in JSX or screens (`app/`): put platform checks in `src/lib` or a hook and consume the result. Current legitimate site: `src/hooks/use-push-notifications.ts` (Android channel).
- Backend payloads needing `'ios' | 'android'` use `DEVICE_PLATFORM` from `src/lib/env.ts` — never re-derive `Platform.OS === 'ios' ? 'ios' : 'android'` inline.
- Module-scope platform guards use the compile-time env var, like `src/lib/haptics.ts`: `process.env.EXPO_OS !== 'web'`.
- If a module's IMPORTS diverge by platform, use a Metro file split with identical export lists, modeled on `src/lib/clerk-client.{ts,native.ts,web.ts}` — never wrap platform-only imports in a runtime branch.
- Do not add `web()`/`ios()`/`android()` style helpers or platform-split components pre-emptively; this app has no web target and too few call sites to justify them.

## i18n (i18next, fr/en)

Catalogs live in `src/i18n/locales/en.json` and `fr.json`; init/sanitization in `src/lib/i18n.ts` + `src/lib/app-locale.ts`. Default and fallback language is **fr**.

- Every user-facing string goes through `t('...')` from `useTranslation()`, with the key added to **both** en.json and fr.json in the same change. Key parity is enforced by `bun run lint:design`. Dev-only UI (`src/components/dev/`) is exempt.
- Locale coercion: use `parseAppLocale(i18n.language)` from `src/lib/app-locale.ts`. Never write `i18n.language === 'en' ? 'en' : 'fr'` inline.
- Dates: format with `toLocaleDateString(toIntlLocale(i18n.language), {...})` using `toIntlLocale` from `src/lib/app-locale.ts`. Never hardcode `'fr-FR'`/`'en-GB'` at a call site, and never call `toLocaleString()` with no locale — that freezes to the device locale and ignores the in-app FR/EN toggle. If a repeated Intl options object shows up at several sites, extract a `formatDate` helper into `src/lib/` next to `format-currency.ts`.
- Plurals: use i18next suffix keys in both catalogs and pass `count`:
  ```json
  "memberCount_one": "{{count}} member",
  "memberCount_other": "{{count}} members"
  ```
  `t('groups.memberCount', { count })` — never concatenate a number with a translated noun.
- Currency is locale-independent by design: always `formatCurrencyXAF()` from `src/lib/format-currency.ts` (`10 000 F`).
- USSD instruction copy is intentionally OUTSIDE the catalogs (`src/lib/ussd-content.ts`, bundled fr/en with Convex OTA override for offline-first) — do not migrate it into en.json/fr.json.
- Language switching: `LanguageToggle` already handles `changeLanguage` + SecureStore persistence + Convex `users.language` sync. New code reads the language reactively via `useTranslation()`; do not cache `i18n.language` in module scope.

## Performance

Domain is healthy — these rules preserve the existing conventions:

- **Lists.** Unbounded/feed screens use `FlashList` with a `keyExtractor` and a `memo()`'d row (template: `app/(app)/(tabs)/index.tsx` + `src/components/groups/group-card.tsx`). Hoist `ItemSeparatorComponent`/header/footer to module-level components — never inline `() => <View/>`, it remounts every render. Bounded detail screens (group, round, pay) stay on `ScrollView`; do not virtualize a njangi's tens of members.
- **Animation.** Per-frame values go through a Reanimated `SharedValue` + `useAnimatedStyle`, never React state (template: `src/components/ui/pot-progress.tsx`). One-shot state-transition pops use `entering` + `key=` remount (template: `PaymentStateBadge` in `src/components/ui/badge.tsx`).
- **Convex + keystrokes.** Never derive `useQuery` args directly from per-keystroke state — each arg change tears down and recreates the Convex subscription. Wrap the derived value in `useDeferredValue` (known instance to fix on touch: username search in `app/(app)/groups/[groupId]/add-member.tsx`).
- **Memoization.** React Compiler is NOT enabled — `memo()` at list-row boundaries is load-bearing. Beyond that, do not write `useMemo`/`useCallback` proactively; reserve them for (a) values in effect dependency arrays, (b) callbacks handed to non-React systems (Reanimated worklets, timers, native listeners) — and say which in a comment.
- **Roll-call ceiling.** `meeting.tsx` renders roll-call as `rows.map` in a `ScrollView`; fine at real group sizes. If groups exceed ~50 members or rows gain animation, convert to `FlashList` with a memo'd `RollCallRow`.

## Errors & Observability

- **Server errors users can act on** must be `throw new ConvexError({ code: 'snake_case' })`, never `throw new Error('message')` — Convex redacts plain Error messages to "Server Error" in production. Follow `convex/memberships.ts` (`{ code: 'already_member' }`). Reserve plain `Error` for invariant violations that should stay opaque. Convert existing throws opportunistically when editing a function; add the matching `errors.<code>` key to both locale files.
- **Client error UX**: never `toast.error(err.message)` and never regex-match `err.message`. Use `showErrorToast(err, t)` from `src/lib/error-toast.ts`, which fires `haptics.error()`, maps `err.data.code` from ConvexError to `errors.<code>` i18next keys (en + fr), classifies offline failures via `isNetworkError`, and falls back to `t('common.error')`. Branch UI logic on `err instanceof ConvexError && err.data.code === '...'`. Migrate existing `toast.error(err.message)` sites on touch.
- **Logging**: no bare `console.*` in `src/` or `app/` — use `src/lib/logger.ts` (console in dev; prod transport is a no-op seam until a crash reporter lands — swap it there, not at call sites). Log handled failures with a constant title so a future reporter can group them: `logger.error('PayFlow: claim failed', { error: err })`. `console.*` inside `convex/` is fine — it lands in the Convex dashboard.
- **No client retry wrappers**: the Convex client reconnects and re-runs subscriptions itself. On failure, show the state and let the user retry. For screens whose query can legitimately fail (revoked membership, deleted group), export an `ErrorBoundary` from the route file with a translated message and a retry/re-navigate affordance.

## Navigation (expo-router)

Typed routes are ON (`experiments.typedRoutes` in app.json). Rules:

- Navigate to dynamic routes with the object form only: `router.push({ pathname: '/groups/[groupId]/rounds/[roundId]/pay/ussd', params: { groupId, roundId, record, method } })`. Never build path strings by template, and never cast a navigation arg (`as any` / `as Href` on a raw string is a bug — the one sanctioned cast is the push deep-link entry point below).
- Push deep-link URLs are built ONLY by the builders in `convex/lib/appLinks.ts` (`paymentLink`, `groupLink`) and routed ONLY through the prefix allowlist in `src/hooks/use-push-notifications.ts` (which also replays the cold-start tap via `getLastNotificationResponseAsync`). Adding a new push deep link = add a builder there + a prefix in the allowlist. Backend strings and `app/` routes must never drift.
- Route params are untrusted strings. Screen pattern (copy `app/(app)/payments/[paymentId].tsx`): `useLocalSearchParams<{...}>()` with explicit generic → skip the Convex query until the param exists (`'skip' as const`) → render a not-found branch on `null`. Deep-link-target Convex queries take `v.string()` + `ctx.db.normalizeId(...)` (return null), not `v.id(...)` — which throws out of `useQuery` into render.
- All screen presentation is registered in `app/(app)/_layout.tsx`; register new modals there. One modal layer per flow: the entry screen is the only `presentation: 'modal'`; later steps push as plain cards inside it (see the pay-flow comment in that layout). Money flows that must not be swipe-dismissed use `fullScreenModal` + `gestureEnabled: false` (meeting screen).
- Back from any deep-link-reachable screen: `router.canGoBack() ? router.back() : router.replace('/')` — never bare `router.back()`.
- Buttons that push a modal must be double-tap safe (busy state or the shared dedupe helper).
- Stale/malformed deep links land on `app/+not-found.tsx` (translated, with a `router.replace('/')` CTA).
- Invites are 6-char codes entered in `app/(app)/join-by-code.tsx` — deliberately no web link layer; do not add scheme/universal invite links without revisiting that decision.

## Footguns

1. **Plain `throw new Error` in `convex/` reaches prod users as "Server Error"** — use `ConvexError({ code })` for anything the UI shows or branches on.
2. **`setVisible(false)` + `router.back()` in the same tick** races two dismissal animations. Navigate OR use the Modal's `onDismiss`, never both at once.
3. **`bg-amber-100` etc. silently produce nothing** — the Tailwind default palette is removed. Only semantic token classes exist.
4. **`<Text>` without a `font-*` class breaks on Android** (bare fontWeight + static font files).
5. **`dark:` variants are dead code** — dark mode flips via CSS vars from `mobile-ui-config.json`; fix the dark token, not the call site.
6. **Bare `toLocaleString()` / hardcoded `'fr-FR'`** ignores the in-app FR/EN toggle — always `toIntlLocale(i18n.language)`.
7. **`useQuery` args from per-keystroke state** tear down the Convex subscription on every character — `useDeferredValue` the derived arg.
8. **Optimistic updates on money mutations are forbidden by design** — busy flag + subscription truth; idempotency key generated once per tap.
9. **`v.id(...)` on a deep-link param throws into render** (no global ErrorBoundary) — accept `v.string()` + `normalizeId`, return `null`.
10. **`JSON.parse(raw) as T` at a storage boundary** can replay garbage into money mutations (meeting queue) — validate with a predicate, fall back to a typed default.
11. **Bare `router.back()` on a deep-link-reachable screen** crashes when there is no history — guard with `canGoBack()`.
12. **Inline `ItemSeparatorComponent={() => <View/>}`** remounts every render — hoist to module level.

## Key Files Reference

| Purpose | Location |
| --- | --- |
| Design tokens (single source of truth) | `src/lib/mobile-ui-config.json` |
| Token → class mapping, CSS-var flip | `tailwind.config.ts` |
| JS-track theme, shadows | `src/lib/theme.ts` (`useAppTheme`, `useShadow`) |
| Per-group identity colors | `src/lib/group-colors.ts` |
| House-rule lint (conventions live here) | `scripts/lint-design-system.ts` |
| i18n catalogs | `src/i18n/locales/{en,fr}.json` |
| Locale coercion / Intl tags | `src/lib/app-locale.ts` (`parseAppLocale`, `toIntlLocale`) |
| Currency formatting | `src/lib/format-currency.ts` (`formatCurrencyXAF`) |
| Error toast + code mapping | `src/lib/error-toast.ts` (`showErrorToast`) |
| Logger (dev console / prod seam) | `src/lib/logger.ts` (`logger`, `isNetworkError`) |
| Haptics (platform-guarded) | `src/lib/haptics.ts` |
| Idempotency keys for claims | `src/lib/idempotency.ts` |
| Offline meeting tap queue | `src/lib/meeting-queue.ts` |
| Persisted-key registry | `src/lib/storage-keys.ts` |
| USSD copy (outside i18n, OTA-overridable) | `src/lib/ussd-content.ts` |
| Platform constants (`DEVICE_PLATFORM`) | `src/lib/env.ts` |
| Platform-split template | `src/lib/clerk-client.{ts,native.ts,web.ts}` |
| Modal/presentation registration | `app/(app)/_layout.tsx` |
| Push deep-link builders (backend) | `convex/lib/appLinks.ts` |
| Push deep-link allowlist parser (client) | `src/hooks/use-push-notifications.ts` |
| Schema + shared validators + denorm notes | `convex/schema.ts` |
| Tested money math | `convex/lib/` (`cycleMath`, `roundMath`, `paymentStateMachine`) |
| ConvexError house pattern | `convex/memberships.ts` (`already_member`) |
| Param-handling screen template | `app/(app)/payments/[paymentId].tsx` |
| Animation templates | `src/components/ui/pot-progress.tsx`, `src/components/ui/badge.tsx` |
| Multi-await liveness template | `app/(app)/groups/[groupId]/rounds/[roundId]/meeting.tsx` |
