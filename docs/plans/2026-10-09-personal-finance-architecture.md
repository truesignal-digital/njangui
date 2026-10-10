# Personal finance: fundamental architecture

**Date:** 2026-10-09 · **Status:** draft, revised after Fable's review · **Product:** the "Simple" direction (`docs/prototypes/personal-finance-2026-10/simple.html`)

## The one rule that shapes everything

Every piece of code lives where its bugs can be fixed fastest, and where the person's private data is safest.

| Tier | Ships in | What lives here |
|---|---|---|
| Convex functions | minutes | Money math, the ledger, classification, which evening cards to show, SMS parser templates |
| JS bundle (EAS Update) | hours | Screens, the evening ritual, the banknote counter, copy |
| Native binary (store) | days | The Android SMS module, the widget, permissions |

Two consequences:
- **Parsing rules are data, not code.** Operators change their SMS wording without warning. Parser templates live in a Convex table, so a broken template is fixed in minutes without an app release.
- **Raw SMS text never leaves the phone.** The device reads and parses; only structured fields go to the server (consent screen 2: "Je garde montants, noms et dates. Jamais le texte.").
- **"Seulement eux" is enforced in Kotlin.** The sender allowlist lives in the native module, so only Orange, MTN and bank SMS ever reach JavaScript; it is not a JS filter.
- **Templates are data, never code.** A template maps text to one fixed event shape; nothing in it is executable.

## System map

```
PHONE (Expo / React Native)                               CONVEX (server truth)
┌──────────────────────────────────────────────┐         ┌──────────────────────────────────────┐
│ Android SMS module (Kotlin, ours)            │
│   sender allowlist enforced HERE, in Kotlin  │         │ ingestEvents (batched, idempotent)   │
│   inbox read by sender + new-SMS receiver    │         │   dedupe · balance chain · classify  │
│        │ raw text (stays on the phone)       │         │   update dailySummary (same txn)     │
│        ▼                                     │         │                                      │
│ Parser (pure TS) ◀── templates (cached) ─────┼─────────┤ parserTemplates (OTA)                │
│        │ structured events                   │         │                                      │
│        ▼                                     │  batch  │ tonightsCards (query) · answerCard   │
│ Local outbox (durable-queue) ────────────────┼────────▶│ cashCounts · pockets · moneyEvents   │
│   pending events, cash counts, answers       │         │ merchantDirectory · userRules        │
│   + last home snapshot (instant cold start)  │         │ budgets · habitPlans                 │
│                                              │◀────────┤ reactive queries (home = 1 doc)      │
│ UI: Moi · Nous · Le point du soir · Ledger   │         │ crons: Sunday report, 1st-of-month   │
│ TTS (expo-speech) · local reminders          │         │ privacy: export, delete (batched)    │
│ widget (later) · voice (later)               │         │ njangi ledger (existing, unchanged)  │
└──────────────────────────────────────────────┘         └──────────────────────────────────────┘
     Clerk (auth) · Sentry (errors, perf) · EAS Update (channels) · Play / App Store
```

## UI layer

**Navigation (expo-router)**
- Tabs: `(tabs)/moi`, `(tabs)/nous`. They replace Aujourd'hui · Groupes · Actions. The push deep-link allowlist in `src/hooks/use-push-notifications.ts` and the attention routing move in the same change.
- Routes:
  - `ritual` is a `fullScreenModal` with the swipe gesture off: a money flow, never dismissed by accident.
  - `pockets/[pocketId]` is the ledger.
  - `settings/data` is Vos données.
  - Onboarding steps push as cards.
- Every route follows the house param pattern: `v.string()` plus `normalizeId`, return null, then a not-found branch.

**Design system first.** The neutral kit lands in the app before any personal-finance screen:
- tokens in `mobile-ui-config.json`
- system fonts, which drops the 3 Google font packages
- native icons through `expo-symbols`, which needs the `lint:design` ban changed
- a one-colour pictogram set as `react-native-svg` components (custom; Material Symbols are only placeholders)

**New shared components** (in `src/components/ui/` once a second consumer exists):
- `BanknoteCounter`: tap +1, a visible −, hold to repeat
- `PictogramTile`
- `StoryDeck`: the ritual cards, with Reanimated transitions
- `MoneyLine`: who, how much, when, direction as a word
- `PocketChip`
- `ListenButton`: expo-speech, same place on every screen

**Speed rules on the client**
- **Cold start from a local snapshot.** Moi renders the last known summary from local storage immediately, labelled with its time, while the Convex subscription catches up. Target: under 2 s to a meaningful home on a Tecno Spark-class phone.
- **System fonts and native icons** mean fewer assets to load at startup.
- **Lists:** the ledger uses `FlashList` with memoised rows and a paginated query. Moi and the ritual are bounded and stay on `ScrollView`.
- **Animation:** card transitions run on the UI thread (Reanimated shared values), never through React state. Target: under 100 ms per card.
- **Subscriptions stay narrow.** Moi subscribes to exactly two things: today's summary document and the pockets list.

## Device data layer (offline-first)

The Convex client only caches queries in memory. Cameroon connectivity drops often, and the cash count and SMS capture must work offline. So the phone keeps its own small store.
- **Local outbox** holds parsed SMS events, cash counts and ritual answers.
  - It reuses `src/lib/durable-queue.ts`, the AsyncStorage queue behind Meeting Mode. That already gives write-before-mutation, serialized read-modify-write and idempotent drain, with one scope per pocket.
  - A 300-SMS backfill is about 100 KB of JSON. No SQLite until a real symptom appears (CLAUDE.md: no scale machinery without the symptom).
  - Each item carries an idempotency key created once.
- **Android backup is off** (`android:allowBackup="false"`). Otherwise Android auto-backup would copy the outbox and home snapshot to Google Drive.
- **Read cursors** record the last SMS read per sender and per number, so a backfill resumes where it stopped.
- **Home snapshot:** the last `dailySummary` plus pockets, for an instant cold start.
- **Parser templates cache:** a bundled floor plus a cache gated by version. The pattern is `src/lib/ussd-content.ts`.
- All keys go in `src/lib/storage-keys.ts`, and every read is validated with a predicate. No `JSON.parse(raw) as T`.

## Server layer (Convex)

**Modules**
- `convex/money/`: `pockets.ts`, `events.ts` (ingest), `ritual.ts`, `summaries.ts`, `budgets.ts`, `merchants.ts`, `parserTemplates.ts`, `privacy.ts` (export, delete).
- **Pure logic** in `convex/lib/money/` with `bun:test` beside each file:
  - `balanceChain`: gaps and suspect credits
  - `dedupe`
  - `cashMath`: "Normalement" = last count + cash-outs − cash already in the ledger
  - `classify`: user rule, then merchant directory, then heuristics, with a confidence score
  - `summaryFold`
  - `budgetProposal`
  - `cardsForTonight`

**Ingest**
- `ingestEvents` is a mutation taking a batch of at most 50 events.
- **Every movement carries a client idempotency key**, deduplicated through a `by_idempotency_key` index, as `paymentRecords` already does (`convex/schema.ts:338`). Cash, voice and gap-fill entries have no operator reference, so the key is what stops replays from double-counting money. SMS events are also checked against `(pocketId, operatorRef)`.
- In one transaction it extends the balance chain, classifies, and updates `dailySummaries`. The writer owns the copy, per CLAUDE.md's denormalization rule. The summary is per user, so there is no cross-user contention.
- **Merchant-directory votes happen outside the transaction**, through `ctx.scheduler.runAfter(0, internal…)`. The directory is global; voting inside ingest would make every user's ingest fight over the same documents.
- **The server computes `day` from `occurredAt`** in Douala time (UTC+1, no daylight saving). It never trusts a day sent by the device: cheap phones often have wrong clocks.
- A backfill of 300 SMS is 6 calls. Target: under 10 s.

**The ritual**
- **Cards are derived, not stored.** `tonightsCards` reads `moneyEvents` through `by_userId_and_status` (`take(10)`) plus today's `cashCounts`. An `askedAt` field on the movement orders skipped cards.
- Confident guesses are filed silently and appear in the "C'est juste ?" summary.
- `answerCard` writes to the movement itself and is idempotent through its key.

**Habit reminders**
- **Mainly local notifications**, scheduled on the phone at the moment the person chose. They need no server, work offline, and never include amounts.
- **Plus a server nudge** (FCM push) after 3 evenings without a ritual. Tecno and Infinix battery savers often kill local alarms.
- Convex crons run in UTC, so they are scheduled at the UTC equivalent of Douala time. They process users in batches that schedule their own continuation.

**Rules carried over**
- `ConvexError({ code })` for every error a user sees.
- `args` and `returns` validators on every function.
- Function signatures only ever gain fields, never lose them, because installed apps update slowly.
- **Hashing is protection at rest, not in transit.** The phone sends raw phone numbers in mutation arguments, and the server hashes them with a secret key before storing them. So `convex/money/` must never log its arguments (a `lint:design` rule). The "··41" label is computed on the phone.
- Personal-money data is **never** readable by group members. Every query is scoped to the caller. The njangi ledger only meets personal data at one point: the njangi position card, built from the caller's own memberships.

## Database layer (new Convex tables)

| Table | Key fields | Indexes |
|---|---|---|
| `pockets` | userId, kind (`om`·`mtn`·`cash`·`bank`), numberHash, label, enabled, lastSmsAt, lastBalance | `by_userId` |
| `moneyEvents` | userId, pocketId, idempotencyKey, occurredAt, day (Douala `YYYY-MM-DD`, server-computed), direction (`in`·`out`·`move`), kind, amount, fee, tax, counterpartyHash, counterpartyLabel, operatorRef, balanceAfter?, source (`sms`·`paste`·`ocr`·`cash`·`voice`), bagKey?, classifiedBy (`auto`·`user`), confidence, status (`ok`·`gap`·`suspect`) | `by_idempotency_key`, `by_userId_and_day`, `by_pocketId_and_occurredAt`, `by_pocketId_and_operatorRef`, `by_userId_and_status` (+ `askedAt` field) |
| `cashCounts` | userId, day, countedAt, amount, expected, denominations (bounded) | `by_userId_and_day` |
| `dailySummaries` | userId, day, out, in, byBag (≤ 20 keys), cardsPending | `by_userId_and_day` |
| `merchantDirectory` (global) | matchKey (operator + merchant code or normalized name), bagKey, votes | `by_matchKey` |
| `userRules` | userId, matchKey, bagKey | `by_userId_and_matchKey` |
| `budgets` | userId, month, bagKey, limit | `by_userId_and_month` |
| `habitPlans` | userId, moment, localTime, programStartedAt | `by_userId` |
| `parserTemplates` | operator, version, spec, active | `by_operator_and_active` |

- **Money is integers in XAF**, as the ledger does today.
- **Hashes:** numbers and counterparties are hashed with a server-side key before storage. The label the person sees ("Maman") is their own data.
- **Reads are always bounded:** no `.collect()` on `moneyEvents` or `merchantDirectory`. Home reads one `dailySummaries` document. The ledger paginates.
- **Deleting everything** runs in batches with `take(n)` plus a self-scheduling continuation, so it stays inside Convex transaction limits.
- **Retention (Law 2024/017, keep only what's needed):** data is kept while the account is active and deleted on request. A purge cron removes accounts inactive for a period the lawyer sets (E8.4).
- **Existing njangi users:** they land on Moi with no pockets yet, and see the first-run state (cash count). Their attention items move from the Actions tab to Nous.

## Environments and delivery

| Environment | Branch | Convex | App update channel |
|---|---|---|---|
| Local | any | `convex dev` (personal) | dev client |
| **Staging** | **`develop`** | staging (`benevolent-gopher-102`), deployed when a merge passes CI | EAS Update → `preview` (testers' preview builds) |
| **Production** | **`main`** | prod, deployed when a release merge passes CI | EAS Update → `production`; the native fingerprint decides OTA vs store build |

- Feature branches merge into `develop`. A release is a PR from `develop` into `main` titled "Release: <what> (date)".
- **This replaces the "Ship from Trunk" model** in `docs/deployment-model.html`, which deliberately rejected per-environment branches. That needs an ADR. To limit drift:
  - Nothing lands on `main` except release merges and hotfixes.
  - A hotfix merges into `main` and is merged back into `develop` the same day.
  - The same commit that passed staging is the one promoted.
- **Promotion republishes the staging update; it never rebuilds.** A release merge creates a new commit, and a fresh `eas update` from `main` would be a new, untested artifact. So the JS update tested on `preview` is promoted with `eas update:republish --destination-channel production`.
- **Convex:** `deploy-convex.yml` changes from "staging, then prod, on `main`" to "`develop` → staging, `main` → prod". `ci.yml` also runs on pushes to `develop`.
- **Staging and production use different Convex deployments with the same function signatures.** Signatures only gain fields, which protects both preview and production apps.
- **ADR-0001 must record:**
  - the decision, and that it supersedes the trunk model (`docs/deployment-model.html` §1–2)
  - why: testers on staging before real-money users, and app binaries that ship at store speed
  - the invariants:
    - only release merges and hotfixes land on `main`
    - a hotfix is merged back into `develop` the same day
    - a release merges the head of `develop`
    - JS is promoted by republish, not rebuilt
    - Convex prod deploys only from `main`
    - function signatures only gain fields
    - the required check stays `CI`
  - the revert trigger: hotfix drift left unmerged, or a release stuck on staging for more than a day, sends us back to trunk.

## Quality gates

- **CI (one required check):** `typecheck`, `lint:design`, `bun run test` (money math plus parser test cases), `test:convex` (integration).
- **Parser test cases:** anonymized real SMS from Phase 0, one file per operator and template version. A template change that breaks a case fails CI.
- **Native module:** verified on a real low-end Android, with a walkthrough recording linked in the PR.
- **Sentry:** errors are already wired (`src/lib/logger.ts` transport, `app/_layout.tsx`). Add performance traces for cold start, ingest and the ritual; the budgets above are the alert lines.
- **Every slice's Definition of done:** fr and en keys added together (`lint:design` checks parity), and an `errors.<code>` key for each new `ConvexError` code.
- **iOS:** the SMS module is Android-only, so iOS must build and run without it. Adding the module changes the native fingerprint, so its slice includes a new preview build.

## Open decisions (from the design rounds)

1. Pocket amounts hidden by default.
2. **Account timing (blocks E5).** Recommended: keep the Clerk username + password login, asked right after consent and before the first sync. The cash count can stay on the phone until then.
3. A custom pictogram set.
4. Voice input before or after the pilot.
5. A WhatsApp channel for the ritual, after the Phase 0 test.
