# Njangi — Member-Facing Payment Features: Vertical-Slice Build Plan

> Supersedes Codex's 5-phase sketch. Grounded in the four research reports and verified
> against `convex/paymentRecords.ts`, `convex/rounds.ts`, `convex/cycles.ts`,
> `convex/groups.ts`, `convex/dev.ts`, `convex/crons.ts`, `convex/schema.ts`, and
> `src/`. Every slice runs the mandatory loop in `docs/build-plan.md` lines 6-38:
> **re-GATE → BRANCH `feat/<slug>` → BUILD in chunks → VERIFY in sim → MERGE to main.**

---

## How this improves on Codex's plan

Codex's instinct is correct and kept: **one feature = one route + one Convex path**, frontend-first because the
PaymentRecord state machine is already built and tested (`claim` `paymentRecords.ts:443`, `confirm` `:611`,
`dispute` `:720`, `cancel` `:804`, `resolveDispute` `:896`). What Codex got wrong or dropped, and how this plan fixes it:

1. **Phase 1 is un-runnable as written.** PaymentRecords are minted only in `openRoundForTick`
   (`rounds.ts:163`), reachable only via the 15-min cron (`crons.ts:43` `tick`) or `internal.rounds.openRound`
   (`rounds.ts:482`, an `internalMutation` — uncallable from a client). `devSeed` (`dev.ts:41`) stops at
   `status:'setup'` and never calls `startCycle`. So the seeded group has **no cycle, no rounds, no records,
   nothing to tap "I paid" on.** Fixed by **Slice 0**: a `DEV_SEED_ENABLED`-guarded public dev mutation that
   starts a cycle and force-opens round 1.
2. **`claim()` requires a client UUID** `idempotencyKey` (`paymentRecords.ts:446`, throws on empty `:457`) and
   the app has **no UUID source** (no `expo-crypto`, no `react-native-get-random-values`, `nanoid`/`uuid` only
   transitive). Fixed by **Slice 0**: `src/lib/idempotency.ts`.
3. **No viewer identity on round queries.** `getRound` (`rounds.ts:573`) and `listRoundPayments` (`:653`) return
   no `viewerMembershipId`. "My pending row" is derivable client-side from `getGroup.viewerMembershipId`
   (`groups.ts:442`), but it is cleaner to add it once. Addressed in **Slice 0 / Slice 1**.
4. **No treasurer-inbox query exists** (grep: zero `inbox`/`awaitingConfirm` in `convex/`). Codex treats the
   confirm list as UI-only; it is a **missing query first**. Built in **Slice 3**, reused by the À-confirmer tab.
5. **No single-record read query exists either.** `convex/paymentRecords.ts` has **zero queries — only 5
   mutations** (verified). There is no `getPaymentRecord({paymentRecordId})` anywhere, so the Slice 4
   `payments/[paymentId]` deep-link target is **un-buildable as written** until that query is added. Built in
   **Slice 3/4**.
6. **"Simple activity feed entry" conflates writes (done) with the missing READ query.** Events are already
   written via `logActivityEvent`; there is **no paginated read query** and the renderer must exclude
   `payment_auto_disputed` (private escalation, `paymentRecords.ts:407-419`). Promoted to its own **Slice 7**
   (roadmap Feature 7), not a Phase-2 footnote.
7. **Three whole MVP surfaces are missing from Codex's phases:** USSD method screens (M5), the dispute path
   (M9), and push/in-app inbox (M12). Added as explicit slices (4, 5, 6).
8. **Sequencing fix:** the À-confirmer **inbox is the safety channel** for Meeting Mode's auto-confirm objection
   window (03 §E "the guaranteed channel"; 05 moved push up because "Week 4 Meeting Mode depends on it").
   The tab shell + inbox must land **before** Meeting Mode, not in a final Phase 5. See *Tab/shell placement*.
9. **Self-record fast-path:** the treasurer's own contribution is a self-record (`payer===payee`,
   `paymentStateMachine.ts:153`) and `claim()` jumps `pending→confirmed` in one tap (`paymentRecords.ts:519-547`).
   The UI must **read the returned `state`**, not assume `claimed`.
10. **Custody copy + locked terminology** (03 §F) is product-defining and MUST be lint-gated — but **no such lint
    exists today.** `scripts/` contains only `patch-clerk-ios-simulator-keychain.js`; there is **no
    `lint-design-system.ts`, no `custody-copy-allowlist.json`, and no `lint`/`test`/`design` script in
    `package.json`** (only `typecheck`/`ios`/`run:ios`). The custody/terminology gate is therefore **NEW work this
    plan builds in Slice 0d** — it is *not* an existing CI contract. Every "fails CI lint" / "CI-enforced" claim
    below means *enforced by the Slice-0 lint we are adding*, run in the per-slice loop. See *The custody-copy
    lint does not exist yet*.
11. **`confirmed → cancelled` has no state-machine path AND no `'confirmed→cancelled'` outcome value.**
    `LEGAL_TRANSITIONS.confirmed = []` (`paymentStateMachine.ts:147`), and `overrideOutcomeValidator`
    (`schema.ts:171-174`) is `v.union(v.literal('confirmed'), v.literal('cancelled'))` — the string
    `'confirmed→cancelled'` is **not a legal enum value** (it appears only in a free-text *comment* on
    `presidentOverrides.outcome`). Per docs/02 row 12, the MVP correction is a **NEW amendment PaymentRecord**
    (`amendmentKind:'override_reversal'`), which requires a **schema migration** — confirm is irreversible for these
    slices. Handled explicitly (see *The confirmed→cancelled gap*).

> **Slice ↔ roadmap branch mapping** (`build-plan.md:62-76`): Slice 1 = `feat/round-claim-ui`,
> Slice 2 = (USSD chunk of `feat/round-claim-ui`), Slice 3 = `feat/treasurer-inbox`,
> Slice 4 = `feat/push-inbox`, Slice 5 = `feat/meeting-mode`, Slice 6 = `feat/payout-ui`,
> Slice 7 = `feat/activity-feed`, Slice 8 = `feat/round-summary`.

---

## Slice 0 — Prerequisites (cross-cutting infra; not user-facing)

**Why first:** Slices 1+ cannot satisfy the VERIFY step (`build-plan.md:21` — *RUN the app and drive the feature
end-to-end*) without (a) a claimable open round in the sim, (b) a UUID for `claim()`, (c) a **two-account seed** so a
real payer→payee handshake is drivable, and (d) the **custody/terminology lint** the rest of the plan depends on.
These are not features; they are the test harness, the call contract, and the gate.

### 0a — Dev open-round affordance + two-account seed (the Phase-1 blocker)
- **Backend** `convex/dev.ts`: add `devStartAndOpenRound({ groupId })` (or extend `devSeed` with an
  `openFirstRound?: boolean`), guarded by `assertDevSeedEnabled()` (`dev.ts:15`). It must:
  1. Call the same logic as `startCycle` (`cycles.ts:173`) — note `startCycle` **hard-requires the first round's
     `dueAt` in the future** ("Start date must be today or in the future"), so seed a near-future startDate, then
  2. **Backdate** round 1's `scheduledOpenAt` to `Date.now()` and call `openRoundForTick(ctx, roundId)`
     (`rounds.ts:163`) directly. `openRoundForTick` early-returns false unless `cycle.status==='active'` AND
     `group.status==='active'`, so the cycle must be started first.
  - Result: round 1 → `open`, pending `paymentRecords` minted for every obligated contributor (`rounds.ts:199`),
    plus the `payout` record in `via_treasurer` mode (`rounds.ts:222`).
- **Seed fix (MANDATORY, blocking — not "or document as payer-side-only"):** `devSeed` (`dev.ts:89-98`) currently
  makes **every non-president member a feature-phone member** (no `userId`) and makes **member[0] the treasurer**.
  Because the contribution payee in `via_treasurer` mode is that treasurer — who has **no `userId`** — and `claim()`
  requires `requireActiveActor` → a linked `userId` (`paymentRecords.ts:463`, `requireActiveActor:78-90`), **the
  seeded group can demonstrate ONLY the self-record fast-path (president's own instant-confirmed contribution) and
  never a two-sided `claim → confirm` handshake.** Fix concretely:
  - Give the **treasurer membership a real `userId`** (reuse the signed-in user, or create a second seeded
    account) **AND** give **≥1 ordinary member a real `userId`**, so a real `payer (member, userId) →
    payee (treasurer, userId)` handshake is drivable in-sim.
  - **One-identity caveat (call this out):** the Convex/Clerk sim has **one auth identity at a time**, so VERIFYing
    a true two-sided handshake requires **either two devices/identities OR a dev-only "act-as-membership"
    affordance**. "Switch to treasurer context" (Slice 3 VERIFY) is otherwise impossible with one Clerk session —
    decide which (recommend a `__DEV__`-only act-as affordance) here, since Slices 3/4/5 all depend on it.
- **Frontend** `src/components/dev/dev-tools.tsx`: add a `DevOpenRoundButton` beside `DevSeedButton`
  (`dev-tools.tsx:103`), mounted under `__DEV__` as a sibling of the Stack in `app/(app)/_layout.tsx`.

### 0b — idempotencyKey / UUID generation
- **New** `src/lib/idempotency.ts`: prefer `crypto.randomUUID()` if it exists at runtime under Hermes;
  else add `expo-crypto` to `package.json` and use `Crypto.randomUUID()`. The key must be **generated once per
  logical tap and held in component state** (reused on retry), never regenerated per render — this is the I-11
  offline-replay contract (`paymentRecords.ts:466-480`). The same helper feeds Slice 5's AsyncStorage tap queue.

### 0c — Viewer-scoped helpers
- **Minimal (recommended):** derive "my pending row" client-side: `getGroup.viewerMembershipId` (`groups.ts:442`)
  matched against `listRoundPayments` rows keyed by `row.membershipId` (the payer). This is the exact pattern in
  `groups/[groupId]/index.tsx` (roster `isMe`). No backend change needed for Slice 1.
- **Optional polish:** add `viewerMembershipId` to `getRound`'s return (`requireMembership` already loads it at
  `rounds.ts:587`) so the round screen needn't also query `getGroup`. Cheap; fold into Slice 1 if convenient.

### 0d — Build the custody/terminology lint (NEW — does not exist) + i18n/optimistic conventions
- **Custody-copy lint (NEW work, the gate the rest of the plan leans on):** `scripts/lint-design-system.ts` and
  `scripts/custody-copy-allowlist.json` **do not exist** and `package.json` has **no lint script** (verified).
  Build them here:
  - `scripts/custody-copy-allowlist.json` encodes the **banned terms** (`solde`, `portefeuille`,
    `envoyez de l'argent`, and `payout`/`versement` on FR surfaces — 03 §F) and the **required custody framing**
    (pot/amount lines must name the holder, never a bare balance — 00 red line / docs/03:103).
  - `scripts/lint-design-system.ts` scans locale JSON + screen copy, failing on any banned term and on
    bare-balance patterns. Also assert the `PAYMENT_STATE_TONE` chip rule (icon+word+color, never color alone).
  - Wire a `"lint:design": "tsx scripts/lint-design-system.ts"` (or `bun run` / `npm run` equivalent) into
    `package.json`, and **run it in the per-slice loop** (added to BUILD chunk gates alongside `typecheck`).
  - Until this exists, all "CI-enforced" / "fails CI lint" language in later slices means *enforced by this
    Slice-0 lint*, not an existing gate.
- **i18n contract (per-slice):** every slice adds **fr.json + en.json keys in the same commit, FR written first**
  (05 M11; matches the cycle-start convention `build-plan.md:100`). Current locales have only
  `common, auth, onboarding, home, groups` — **no `round`/`payment`/`pay`/`confirm`/`meeting` namespaces exist.**
- Add a `PAYMENT_STATE_TONE` map next to `GROUP_STATUS_TONE` (`src/components/ui/badge.tsx`) for chips:
  `○ en attente · ⏳ déclaré · ✓ confirmé · ⚠ contesté · ✕ annulé` (icon+word+color, never color alone — 03 §G).
- Mutation pattern is fixed (`member-list.tsx`/`start-cycle.tsx`): `useMutation`; local busy `useState`;
  `try { await mut(args); haptics.success(); toast.success(...) } catch (err) { haptics.error(); toast.error(err.message) }`.
  Backend error strings are human-readable and should be surfaced via `toast` (e.g. the "confirm or dispute it
  instead" collision message, `paymentRecords.ts:491`). Decide the Convex `optimisticUpdate` pattern here so
  Slice 5 (Meeting Mode) reuses it (05 M6).

**Re-gate?** Slice 0 is infra the gate will demand before Slice 1; bundle 0a/0b/0d into the `feat/round-claim-ui`
branch's first chunks rather than a separate merge.

---

## Slice 1 — Round detail + cash contribution claim  · `feat/round-claim-ui`

**Goal:** From group detail, a member taps the current round, sees the pot (custody-captioned), sees **their own
pending cotisation row**, taps **"J'ai cotisé"**, and the backend row moves `pending → claimed` (or
`→ confirmed` for the treasurer's self-record).

- **Route (NEW):** `app/(app)/groups/[groupId]/rounds/[roundId]/index.tsx`. Reached by adding an `onPress`/
  `router.push` to the display-only `CurrentRoundCard` (`rotation-section.tsx:172`, currently no tap target) and
  navigating with `getActiveCycle.currentRoundId` (`cycles.ts:589`).
- **Fix the pre-existing custody violation ON the entry card (required, not optional):** `CurrentRoundCard`
  already renders `formatCurrencyXAF(round.confirmedTotal) / formatCurrencyXAF(round.expectedTotal)`
  (`rotation-section.tsx:198-201`) as a **bare balance with no custodian name** — the exact bare-balance the 00 red
  line and docs/03:103 forbid. When wiring the tap target onto this card, also **bring its existing pot figure
  under the custody caption** (route the figure through the new `pot.custody` string / name the holder). Otherwise
  Slice 1 ships a screen-entry card that violates the very red line the slice enforces, and the Slice-0 lint (once
  built) would flag it.
- **Convex paths:**
  - Read: `api.rounds.getRound` (`rounds.ts:573`) + `api.rounds.listRoundPayments` (`rounds.ts:653`) +
    `api.groups.getGroup` (for `viewerMembershipId`).
  - Write: `api.paymentRecords.claim` with `{ paymentRecordId, idempotencyKey, method: 'cash' }`. **Cash sends NO
    `momoTxnId`/`screenshotStorageId`** or the mutation throws (`paymentRecords.ts:502-509`). Omit `amount` to use
    the prefilled `record.amount`.
- **Backend additions:** none (Slice 0c optional `viewerMembershipId` on `getRound`).
- **Correctness the UI must honor:**
  - **Read the returned `state`.** Self-records (treasurer's own contribution) return `confirmed` in one tap
    (`paymentRecords.ts:519-547`) — render "done", no confirm/dispute affordance, feed label
    "auto — même personne". Non-self returns `claimed` → render "⏳ déclaré · en attente de confirmation".
  - **`scheduled` (not-yet-open) round** must render a distinct empty state — `getRound` returns `status:'scheduled'`
    with empty pot and `listRoundPayments` returns `[]` (`cycles.getActiveCycle.currentRoundId` falls back to a
    scheduled round, `cycles.ts:589`). This is a real UI state Codex ignores.
  - **`beneficiaryContributes:false`:** the beneficiary has **no pending row** in their own round
    (`openRoundForTick` skips it). The "my row" lookup must return nothing gracefully (the seed has
    `beneficiaryContributes:true` so this only matters once toggled).
- **FR/EN UX (03 §F locked terms):** contribution→**cotisation**; CTA `home.cta.contribute` = "Je cotise" /
  pending-row CTA "J'ai cotisé"; status chips exact. **Custody framing (00 red line):** pot line names the holder
  — `pot.custody` = "Pot : 80 000 / 120 000 F · reçu par Marie (trésorière)" — **never a bare balance**;
  banned terms (`solde`, `portefeuille`, `envoyez de l'argent`) fail the Slice-0 design lint. Use
  `formatCurrencyXAF` → "10 000 F". New keys: `round.progress`, `pot.custody`, `claim.success`,
  `payments.state.*`, `payments.method.cash`.
- **VERIFY:** sim → DevSeed (two-account, Slice 0a) → **DevOpenRound (Slice 0a)** → open group → tap current round →
  confirm the screen shows my pending cotisation row → tap "J'ai cotisé" → toast success → in Convex dashboard
  observe `paymentRecords` row `pending → claimed` **for a non-self member with a real `userId`** (the two-account
  seed makes this drivable; the president's own contribution still demonstrates only the `→ confirmed` self-record
  fast-path), `claimedAt` set, `idempotencyKey` written. Re-tap → idempotent no-op (same `state`).

---

## Slice 2 — USSD method screens (MoMo `*126#` / Orange `#150#`) · USSD chunk of `feat/round-claim-ui`

**Goal:** A member paying by MoMo/Orange gets the 3-screen pay-flow modal stack: method picker → USSD instructions
with a working dial button → claim with `momoTxnId`. (Cash from Slice 1 skips straight to claim.) The instructions
**must be fully readable offline even after an app restart** — the réunion-hall-no-signal critical path.

- **Routes (NEW, 03 §A):**
  `app/(app)/groups/[groupId]/rounds/[roundId]/pay/index.tsx` (method picker, B4 step 1, `?record=` kind-aware),
  `pay/ussd.tsx` (`?method=momo_mtn|orange_money`, B4 step 2), `pay/claim.tsx` (B4 step 3). Pay flow is a
  **modal stack** above the screen.
- **USSD content sourcing — bundled-first, NOT query-only (03:284 / 03:652, hard requirement):** a pure Convex
  query against an empty `ussdContent` table renders **blank instructions offline on first run** — exactly the
  failure the spec forbids. Implement **three-tier priority: bundled → cached → fetched:**
  1. **Bundled static fallback (the spec requirement):** ship the §C canonical FR/EN step text as an in-app
     constant (e.g. `src/lib/ussd-content.ts`). This is what renders offline on first launch.
  2. **AsyncStorage cache:** the last-fetched Convex copy, cached locally for offline reads after restart.
  3. **Convex fetch (OTA override):** `getUssdContent` provides the remotely-updatable override; the `version`
     field (`schema.ts:446`) drives **cache invalidation** (bump version → app re-caches without an app release,
     05 R3).
  - Render order: **bundled-or-cached immediately, then upgrade to fetched if newer `version`.** Seeding 4
    `ussdContent` rows is **necessary but NOT sufficient** — the bundled fallback is the spec requirement.
- **Convex paths:**
  - Read: **NEW** `api.ussdContent.getUssdContent({ method, language })` (see additions) — the OTA override only.
  - Write: `api.paymentRecords.claim` with `method:'momo_mtn'|'orange_money'` and optional `momoTxnId`
    (sets `proofType:'momo_txn_id'`, `paymentRecords.ts:510`). Same idempotencyKey contract as Slice 1.
- **Backend additions (NEW — these do not exist):**
  - `convex/ussdContent.ts`: `getUssdContent` query over `ussdContent` (`schema.ts:443`, indexed
    `by_method_and_language`) returning `{ title, steps, version }`. The table has **zero seed rows and zero
    queries** today.
  - Seed 4 rows `{momo_mtn, orange_money} × {fr, en}` (extend `dev.ts` or a seed script). 03 §C/§D require steps be
    **bundled in the app + cached in AsyncStorage**, with Convex as the OTA override — NOT query-only and NOT
    hardcoded-without-cache.
- **FR/EN UX (03 §C exact copy):** mandatory non-dismissable "les menus peuvent changer" banner; `tel:` deep link
  `Linking.openURL('tel:*126%23')` (MTN) / `'tel:#150%23'` (Orange) — **`#` percent-encoded as `%23`**;
  a **"Copier le code *126#" fallback that ALWAYS renders under the dial button** (Tecno/Itel dialers strip
  `*`/`#` — 03 §G smoke gate). Copy-tap fields: Numéro de Marie / Montant / **Référence NJG-T\<round\> (≤8 chars)**.
  Treasurer-number field carries its own « vérifié le {date} » freshness pill (03:282). Cash path label:
  "J'ai déjà remis les espèces → Déclarer". Keys: `pay.custodyNote`, `pay.ussd.*`.
- **VERIFY:** sim → pay flow → pick MoMo → USSD screen renders steps + banner. **Offline check:** with the device
  offline AND `ussdContent` un-fetched (first run), confirm the **bundled** steps still render — never blank.
  Then with the table seeded + online, confirm the fetched/cached copy renders and a `version` bump re-caches.
  Tap dial button (observe `tel:` intent; the copy fallback is visible) → enter txn ID → claim → row
  `pending → claimed` with `proofType:'momo_txn_id'`, `momoTxnId` set. **Device-test the dial button** (05 Week-1
  RESEARCH FLAG; can't fully validate `tel:` in sim — gate on a physical Tecno/Itel before merge if available).

> Slices 1 and 2 can ship as two commits on the same `feat/round-claim-ui` branch (cash first, then MoMo/OM), or
> split if the USSD seed/query warrants its own gate. Cash-first (Slice 1) is independently mergeable.

---

## Slice 3 — Treasurer confirmation inbox + per-payment query + tab shell · `feat/treasurer-inbox` (+ minimal tabs)

**Goal:** A treasurer sees a list of claims **awaiting their confirmation**, taps **"✓ Reçu"** to confirm
(or **"Contester"** with a reason), and the row moves `claimed → confirmed`. The member who claimed sees their
own row flip. This slice also introduces the minimal **(tabs) shell** so the inbox has a home, and the **NEW
single-record query** that Slice 4's deep-link screen will reuse.

- **Routes (NEW):** introduce `app/(app)/(tabs)/_layout.tsx` with 4 tabs (Accueil, Groupe, **À confirmer** (badge),
  Profil — 03 §A). For this slice only the **À confirmer** tab is real; Accueil = existing group list,
  Groupe/Profil can be stubs. The inbox tab renders the confirm list and routes each row to the per-payment screen.
- **Convex paths:**
  - Read (list): **NEW** `api.paymentRecords.myInbox` (or `rounds.listAwaitingMyConfirmation`) — **no such query
    exists** (grep confirmed). It must union: records where `state==='claimed'` AND
    `((claimedBySide==='payer' AND payeeMembershipId===myMembership) OR (claimedBySide==='payee' AND
    payerMembershipId===myMembership))`. Use indexes `by_payee` and `by_payer` (`schema.ts`). Cross-group requires
    resolving `memberships.by_user` then fanning out per group — for THIS slice, scope to one group; the cross-group
    badge is a later enhancement of the same query.
  - Read (single record): **NEW** `api.paymentRecords.getPaymentRecord({ paymentRecordId })` — see additions. The
    inbox row routes into it; Slice 4's `payments/[paymentId]` deep-link reuses it. `myInbox` (a list of
    `state==='claimed'` rows) **cannot** back a detail screen that must also render `confirmed`/`disputed` records.
  - Write: `api.paymentRecords.confirm` `{ paymentRecordId, channel:'app' }` — **counterparty-only**, rejects
    self-confirmation (`paymentRecords.ts:611`); `api.paymentRecords.dispute` `{ paymentRecordId, reason }` —
    **`reason` REQUIRED** `'not_received'|'wrong_amount'|'other'` (`:720`), collect in a picker;
    `api.paymentRecords.cancel` `{ paymentRecordId }` — claimant-withdraw, **only on the claimant's own device**
    (`:804`).
- **Backend additions (NEW):**
  - `myInbox` query above. (`listRoundPayments` is round-scoped + payer-grouped and exposes **no payee identity per
    record**, so it cannot back the inbox — confirmed in research.)
  - **`getPaymentRecord({ paymentRecordId })` (NEW single-record query — `paymentRecords.ts` has ZERO queries
    today, verified).** It must `requireMembership`-gate the record's group and return: the record + its
    **open/resolved dispute** (join `disputes.by_payment_record`, `schema.ts:354`), the **counterparty
    `displayName`**, **round context** (index, `dueAt` for the objection-window countdown), **proof fields**
    (`momoTxnId`, `screenshotStorageId`), and a **viewer-relative role flag** (am I claimant / counterparty /
    president-on-behalf-eligible) so the screen can choose **C'est exact / Contester vs read-only**. Without this
    query, Slice 4's `payments/[paymentId].tsx` is un-buildable (a push deep-link can land on a record no longer in
    any inbox, and must still render `confirmed`/`disputed` + the dispute thread). `getRound`/`listRoundPayments`
    are round-scoped and expose no per-record payee identity or dispute row.
- **Confirm is irreversible (see gap section):** add an **"Êtes-vous sûr ?" guard** before `confirm()` — there is
  **no `confirmed → cancelled` path** in the backend (`LEGAL_TRANSITIONS.confirmed = []`). Optionally implement the
  **5s deferred-dispatch undo** (03:350 / B5: fire `confirm()` after a 5s client grace window with "Annuler" — the
  spec's stated undo mechanic; once dispatched the only reversal is a president override-reversal amendment).
- **FR/EN UX (03 B5 / §F):** inbox row shows payer, amount, method, **référence NJG-T\<n\>**, txn ID, screenshot
  thumb. Actions: "✓ Reçu" (confirm) / "Pas reçu" → dispute (reason picker) / "Marquer reçu". Treasurer CTA
  "Confirmer N paiements". Keys: `confirm.toast`, `dispute.opened`. claimed→**déclaré**, confirmed→**confirmé**,
  disputed→**contesté**.
- **VERIFY:** with Slice 0's two-account seed (treasurer + ≥1 member each with a real `userId`) and the dev
  act-as-membership affordance, sim → member identity claims (Slice 1) → switch to treasurer identity → À confirmer
  tab shows the claim → tap "✓ Reçu" → row `claimed → confirmed` in Convex, member's row flips reactively. Tap a row
  → `getPaymentRecord` detail renders counterparty name + proof. Tap "Contester" → pick reason → row → `disputed`,
  one open dispute (I-6).

---

## Slice 4 — Push notifications + in-app inbox channel · `feat/push-inbox`

**Goal:** The auto-confirm **objection window** becomes reachable: a member whose payment was claimed payee-side
(Meeting Mode tick) receives a push **and** an in-app inbox entry with "C'est exact ✓ / Contester", deep-linking to
the per-payment screen. Silence → cron auto-confirms at `T_AUTO_CONFIRM` (48h).

- **Route (NEW):** `app/(app)/payments/[paymentId].tsx` — the **single deep-link target** for both the objection
  window (claimed state, two buttons — 03 B5) and the dispute screen (disputed state — 03 B7; built in Slice 5/here).
  This is the push deep-link landing. **It is backed by `getPaymentRecord` (built in Slice 3), NOT `myInbox`** — a
  deep-link can land on a `confirmed`/`disputed` record that is no longer in any inbox, and the screen must still
  render the record, dispute thread, counterparty name, txn ID, screenshot, and a viewer-relative role flag.
- **Convex paths:**
  - Read (single record): `api.paymentRecords.getPaymentRecord({ paymentId })` (Slice 3 addition) — the screen's
    backing query.
  - Token save: write `users.pushTokens` (`schema.ts:199` — exists, nothing writes it today). NEW mutation
    `api.users.savePushToken`.
  - Send: **NEW** Convex action calling the Expo push API, hooked into `crons.ts` `tick` (`:43`) and the relevant
    transitions. Today `crons.ts` only calls `logActivityEvent` (`kind:'confirm_reminder'`, `:156`) — **no push
    send exists** (grep confirmed).
  - Read (list, in-app channel): reuse Slice 3's `myInbox` query (the **guaranteed in-app channel**, 03 §E) for the
    inbox list; the per-payment objection view uses `getPaymentRecord`.
- **Backend additions (NEW):** `savePushToken` mutation; Expo-push action; wire into cron tick. (`getPaymentRecord`
  is already built in Slice 3.) In-app inbox is the contractual minimum and **must precede Meeting Mode** (05
  explicitly moved push up: "Week 4 Meeting Mode depends on it"). Push is best-effort on top of the inbox.
- **FR/EN UX (03 B6):** objection-window copy "C'est exact ✓" / "Contester" + "confirmation automatique dans 48 h"
  countdown (driven by the round `dueAt` returned from `getPaymentRecord`). `reminder.due`. Member-side objection
  actions call `api.paymentRecords.dispute` (payee-side claim contest) — the member is the payer counterparty here.
- **VERIFY:** trigger a payee-side claim (preview of Slice 5, or a dev call), confirm an inbox entry appears for the
  payer with two buttons; tap a row → `payments/[paymentId]` renders via `getPaymentRecord`. On a physical device
  confirm the push arrives and deep-links to `payments/[paymentId]`; tap "C'est exact" → `confirm`, "Contester" →
  `dispute`. Confirm the cron still auto-confirms on silence.

---

## Slice 5 — Meeting Mode (treasurer roll-call + offline tap queue) · `feat/meeting-mode`

**Goal:** A treasurer runs a réunion: tap each member to record a cash cotisation, ≤100 ms optimistic feedback,
20 entries in 2 min, surviving an app-kill mid-roll-call, ending with a pot/caisse summary.

- **Route (NEW):** `app/(app)/groups/[groupId]/rounds/[roundId]/meeting.tsx`,
  `presentation:'fullScreenModal'` + `expo-keep-awake`.
- **Convex paths:** Read `api.rounds.listRoundPayments` (the pre-created records — `rounds.ts:653`).
  Write `api.paymentRecords.claim` / `api.paymentRecords.confirm` / `api.paymentRecords.cancel`.
- **State-driven row rendering (CORRECTNESS, not optimization — getting it wrong double-counts the pot):**
  - `pending` → one-tap **payee-side `claim`** (cash, prefilled amount; starts `T_AUTO_CONFIRM` 48h).
  - `claimed` **payer-side** (member already claimed via Slice 1) → tap **CONFIRMS the existing record** via
    `confirm()` — **never create a 2nd record.** A blind second `claim()` here **throws** "Record already claimed
    by the other side — confirm or dispute it instead" (`paymentRecords.ts:486-492`); handle that error as a
    "confirm/dispute instead" branch, not a generic failure.
  - `confirmed` → inert. `disputed` → deep-link `payments/[paymentId]` (Slice 4 route).
  - **`↩` per row** = treasurer withdraws own claim (`cancel`, claimed→cancelled, re-creates pending — the only
    legal undo). Pre-claimed confirms use the **5s deferred-dispatch undo** instead.
  - **Long-press** → edit amount (partial → arrears split at claim via `ensureObligationRemainder`), add fine,
    switch method.
- **Offline (the ONE durable exception in the app, 03 §D / 05 Week 4):** an **AsyncStorage tap queue** replayed
  idempotently using the Slice 0b key per tap — distinct from the in-memory optimistic queue used elsewhere.
  Build as its own sub-chunk (the kill-app-mid-roll-call test is a launch-checklist gate).
- **FR/EN UX (03 B6 §F):** header custodian-captioned "ESPÈCES CHEZ MARIE"; "Terminer la réunion" → summary
  (pot and caisse on **separate lines, never summed** — B6 DECISION) → "Marquer le pot remis" (Slice 6) +
  WhatsApp share (Slice 8). `meeting.summaryShare`.
- **VERIFY:** sim → DevOpenRound → Meeting Mode → tap 20 members fast (observe ≤100 ms feedback, records
  `pending→claimed` payee-side); tap an already-payer-claimed row (observe it **confirms**, no duplicate);
  `↩` a row (observe claimed→cancelled→pending). **Kill the app mid-roll-call, reopen → queued taps replay,
  no double-count.** Terminer → summary shows pot/caisse separate.

> Depends on Slice 4 (push/inbox) so the objection window protecting payee-side claims is live.

---

## Slice 6 — Payout "remise du pot" · `feat/payout-ui`

**Goal:** The treasurer marks the pot handed to the beneficiary; the beneficiary (or president on-behalf for a
feature-phone beneficiary) confirms; the round completes with 🎉.

- **Route:** reuse the round-detail screen (Slice 1) "Remise du pot" block + the per-payment confirm path.
- **Convex paths:** the payout record is **pre-created `pending` at open** (`openRoundForTick`, `rounds.ts:222`,
  amount = `payoutPrefillAmount` obligated×contribution). `getRound.payout` returns
  `{ paymentRecordId, state, amount, claimedAt, confirmedAt }` (`rounds.ts:633`) — **null in
  `direct_to_beneficiary` mode or before open.** Two paths, same handshake:
  1. Treasurer "Marquer le pot remis" → `claim` payer-side, **amount treasurer-ENTERED at claim** (prefilled with
     Total confirmé, **editable** — app records reality, never asserts; pass `amount` to `claim()`).
  2. Beneficiary "J'ai reçu le pot" → `claim` payee-side, auto-confirms at `T_AUTO_DISPUTE_PAYOUT` (**7d**) on
     treasurer silence.
  - Confirm: `api.paymentRecords.confirm`. On confirm, `afterConfirmed` → `settleRoundAfterPayoutConfirmed`
    advances `round payout → completed` and may complete the cycle (`paymentRecords.ts:318`).
- **Backend additions:** none for the happy path. **President-on-behalf** for `hasAccount:false` beneficiaries is
  already supported by `confirm`'s `confirm_on_behalf` edge (requires a note) — the **UI must surface it**.
  Without this path, **every feature-phone beneficiary's round auto-disputes** — critical for the pilot's
  feature-phone-dense market group.
- **Self-party:** if treasurer IS beneficiary, the payout is a self-record → `claim()` confirms in one tap. Also
  handle a round already `completed` (closeRoundForTick auto-completes if payout confirmed early, `rounds.ts:355`).
- **FR/EN UX (03 §F):** payout→**remise du pot**; button "Marquer le pot remis"; verb "remettre le pot" —
  **never "payout"/"versement" on FR surfaces** (banned by the Slice-0 design lint). Beneficiary CTA "J'ai reçu le
  pot". President-on-behalf feed label "attesté par le président pour {name}". `payout.confirmed`.
- **VERIFY:** sim → treasurer claims payout (edit amount, observe `claimed` payer-side) → beneficiary confirms
  (`confirmed`) → round `payout → completed`, 🎉 feed event. Toggle a `hasAccount:false` beneficiary → president
  confirms on-behalf with note → same completion.

---

## Slice 7 — Activity feed (read/render) · `feat/activity-feed`

**Goal:** Group members see a paginated activity feed. (Roadmap Feature 7 — an M-sized slice, NOT a Phase-2
footnote. Events are already written; only the read query + renderer are missing.)

- **Route:** feed section on group detail / Accueil home pulse.
- **Convex paths:** **NEW** paginated query using `.paginate()` over `activityEvents.by_group` (ordered desc).
  **No read query exists** today (grep confirmed; events written via `logActivityEvent` everywhere).
- **Backend additions (NEW):** the paginated query MUST apply a **kind allowlist/denylist** —
  **exclude `payment_auto_disputed`** (private escalation, `paymentRecords.ts:407-419`) while
  **`payment_disputed` (human contest) IS feed-visible**; also exclude `confirm_reminder` /
  `obligation_status_finalized` noise. Special-case `president_override` when the president is a party
  (`paymentRecords.ts:982-999`). Join actor names.
- **FR/EN UX:** map ~15 kinds to FR-primary copy; custody framing on amounts. No banned terms (Slice-0 lint).
- **VERIFY:** sim → drive a claim+confirm+dispute → feed renders the human events in order, `payment_auto_disputed`
  is **absent**, `payment_disputed` is present. Scroll → pagination loads more.

---

## Slice 8 — Round summary + WhatsApp share · `feat/round-summary`

**Goal:** The treasurer shares a round/réunion summary to WhatsApp — the pilot's distribution loop and the
feature-phone members' receipt.

- **Route:** the "Terminer la réunion" summary (Slice 5) / round-complete summary.
- **Convex paths:** read-only (`getRound` + `listRoundPayments`); no new mutation.
- **Backend additions:** none.
- **FR/EN UX (03 §F):** summary text builder (FR/EN) with pot/caisse **separate lines**, custodian-captioned;
  native share → `wa.me/?text=` deep link with `njangi://` fallback. `meeting.summaryShare`.
- **VERIFY:** sim → finish a round → "Partager" → WhatsApp opens prefilled with the FR summary; amounts custody-framed.

---

## The custody-copy lint does not exist yet (build it in Slice 0d)

The plan repeatedly leans on a "CI-enforced" custody/terminology gate. **It does not exist.** Verified:
`scripts/` contains only `patch-clerk-ios-simulator-keychain.js`; there is **no `scripts/lint-design-system.ts`,
no `scripts/custody-copy-allowlist.json`**, and `package.json` has **no `lint`/`test`/`design` script** (only
`typecheck`, `ios`, `run:ios`, `start`, `convex:dev`, etc.). **No CI gate enforces any custody/terminology rule
today.**

**Therefore:** Slice 0d **builds** this gate (the allowlist JSON + the lint script + a `lint:design` package
script wired into the per-slice loop). Until then, every "fails CI lint" / "CI-enforced" phrase in this plan means
*enforced by the Slice-0 lint we are adding* — it is **aspirational, not an existing gate**. Read every DoD
custody/terminology line accordingly.

---

## The `confirmed → cancelled` gap (decide before the ledger is leaned on)

`LEGAL_TRANSITIONS.confirmed = []` (`paymentStateMachine.ts:147`); `validateTransition` rejects any transition
from `confirmed` ("confirmed is ledger-final and never mutated", `:256`). Two facts the earlier draft got wrong,
now corrected:

1. **There is no `'confirmed→cancelled'` outcome value.** `overrideOutcomeValidator` (`schema.ts:171-174`) is
   `v.union(v.literal('confirmed'), v.literal('cancelled'))` — two single literals. The string
   `'confirmed→cancelled'` appears **only as a free-text comment** on `presidentOverrides.outcome` (`schema.ts`)
   and is **not a legal enum value.** The earlier draft's claim that "`presidentOverrides.outcome` includes
   `'confirmed→cancelled'`" is false.
2. **The MVP correction is an amendment record, not a state mutation.** Per **docs/02 row 12** (line 207),
   correcting a confirmed row (duplicate / wrong member / fat-finger) creates a **NEW amendment PaymentRecord**
   with **`amendmentKind:'override_reversal'`** that reverses the confirmed row's ledger effect — the original
   confirmed row is **never patched** (01 §3.4) — plus an immutable `presidentOverrides` row, with no counterparty
   handshake. There is **no `amendmentKind` field anywhere in `paymentRecords` today** (verified), and **no
   `createAmendment`/`reverseConfirmed` mutation anywhere in `convex/`**. `resolveDispute` (`:896`) operates only
   on `disputed` records.

**Decision for MVP:** treat confirm as **irreversible.** Therefore:
- Slice 3's confirm UI **must** add an "Êtes-vous sûr ?" guard and/or the **5s deferred-dispatch undo**
  (`docs/03:350` — the spec's stated undo mechanic; a fat-finger confirm cannot be walked back once dispatched).
- Any reversal capability is **NEW backend work with real scope** — **not a single mutation + a `presidentOverrides`
  row.** It requires a **schema migration adding `amendmentKind` to `paymentRecords`** (widen-migrate-narrow), the
  **amendment record's own ledger semantics** (the compensating-record math that folds the reversal into balances),
  plus the `presidentOverrides` artifact. **Out of scope for these slices.** The gate should pull it forward **only
  if** product decides the ledger needs a correction path before launch — and must be told it is a **schema
  migration**, not a small mutation. Flag it on the Slice 3 gate explicitly.

---

## Tab / product-shell placement (Codex puts it LAST — change this)

Codex defers the `(tabs)` shell + À-confirmer inbox to a final Phase 5. That **contradicts its own dependencies**:
the inbox tab IS Slice 3's confirm list AND Slice 4/5's objection-window safety net (03 §E "the guaranteed
channel"). Building Slices 1-6 as bare Stack screens, then retrofitting tabs (pay flow + Meeting Mode as modals
**above** the tabs, deep links `njangi://payments/:pid`, back-swipe guards) **reworks every screen's entry/exit.**

**Recommended ordering:** introduce a **minimal `(tabs)` skeleton in Slice 3** (Accueil = existing group list,
Groupe + Profil stubs, **À confirmer** real). This lands the inbox in its final navigation home before Meeting
Mode needs it, and means later screens are built into the final model from the start. Defer only the **rich**
home pulse (B1), group switcher, and profile to a later cosmetic slice — those don't gate anything.

The current app is `Stack`-only with **no `(tabs)` group** (`app/(app)/_layout.tsx`); `DevSeedButton` is a
`__DEV__` sibling of the Stack — re-home it alongside the tabs conversion.

---

## Slice table

| Slice | Goal (what becomes usable) | Route (NEW unless noted) | Backend path(s) | Size | Re-gate? | VERIFY |
|---|---|---|---|---|---|---|
| 0 | Claimable open round + two-account seed + UUID + design lint + viewer/i18n conventions | `dev-tools.tsx` button; `src/lib/idempotency.ts`; `scripts/lint-design-system.ts` + `custody-copy-allowlist.json` (NEW) | `dev.devStartAndOpenRound` (NEW), seed fix w/ real `userId`s (`dev.ts`), `openRoundForTick`; `lint:design` script (NEW) | M | Yes (gate Slice 1 demands it) | DevOpenRound → round 1 `open`, pending records minted; lint script runs; two-account handshake drivable |
| 1 | Round detail + cash cotisation claim (+ fix bare-balance on entry card) | `groups/[groupId]/rounds/[roundId]/index.tsx` | `rounds.getRound`, `rounds.listRoundPayments`, `groups.getGroup`; `paymentRecords.claim` (method:'cash', idempotencyKey) | M | Yes | Tap "J'ai cotisé" → non-self row `pending→claimed` (or `→confirmed` self-record); `CurrentRoundCard` pot now custody-captioned |
| 2 | MoMo `*126#` / Orange `#150#` USSD pay flow (bundled-offline) | `…/rounds/[roundId]/pay/{index,ussd,claim}.tsx` | `ussdContent.getUssdContent` (NEW, OTA override) + bundled static fallback + AsyncStorage cache + seed; `paymentRecords.claim` (momoTxnId) | M | Maybe (USSD seed) | Bundled steps render offline first-run (never blank); dial button (`tel:` `%23`) + copy fallback; claim `proofType:'momo_txn_id'` |
| 3 | Treasurer confirm inbox + per-payment query + minimal tabs | `(tabs)/_layout.tsx`, À-confirmer tab | `paymentRecords.myInbox` (NEW), `paymentRecords.getPaymentRecord` (NEW); `confirm`/`dispute`(reason)/`cancel` | M | Yes (confirmed→cancelled gap = schema migration) | Treasurer "✓ Reçu" → row `claimed→confirmed`; detail renders via `getPaymentRecord`; "Contester"+reason → `disputed` |
| 4 | Push + in-app objection-window inbox | `payments/[paymentId].tsx` (backed by `getPaymentRecord`) | `users.savePushToken` (NEW), Expo-push action (NEW) in cron; reuse `myInbox`/`getPaymentRecord` | L | Yes | Inbox + push deep-link; "C'est exact"→confirm, "Contester"→dispute; cron auto-confirms on silence |
| 5 | Meeting Mode roll-call + offline queue | `…/rounds/[roundId]/meeting.tsx` (fullScreenModal) | `listRoundPayments`; `claim`/`confirm`/`cancel` | L | Yes | 20-in-2-min; payer-claimed row CONFIRMS (no dup); kill-app → replay |
| 6 | Payout "remise du pot" + president on-behalf | round-detail "Remise du pot" block (reuse) | `getRound.payout`; `claim`(editable amount)/`confirm`(on-behalf) | M | Yes | Claim payout → beneficiary/president confirm → round `payout→completed` 🎉 |
| 7 | Activity feed read/render | feed section | paginated `activityEvents.by_group` query (NEW, kind filter) | M | Yes | Feed shows human events; `payment_auto_disputed` excluded; pagination |
| 8 | Round summary + WhatsApp share | summary screen (reuse) | read-only | S | Maybe | "Partager" → WhatsApp prefilled FR summary, custody-framed |

**Slice count: 9** (Slice 0 prerequisites + 8 ordered vertical slices).

---

## Per-slice loop (all slices)

Each slice: **re-GATE** (adversarial judge panel — Sequencing / Pilot value / Readiness / Opportunity cost,
`build-plan.md:40-57`; the panel may return WAIT and pull a backend hole forward, e.g. the confirmed→cancelled
amendment+schema-migration at Slice 3) → **BRANCH** `feat/<slug>` off `main` (slugs per `build-plan.md:62-76`) →
**BUILD** one commit per chunk (each chunk **typechecks + passes the Slice-0 `lint:design` gate + unit-tests
green**; FR+EN strings in the same commit) → **VERIFY** by RUNNING the app in the sim via the dev seed (two-account)
+ DevOpenRound and **observing the backend row transition** (not "looks done") → **MERGE** to `main` only after
VERIFY passes.