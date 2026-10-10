# Personal finance: build plan (epics and slices)

**Date:** 2026-10-09 · **Status:** revised after Fable's review; to be filed as GitHub issues once `gh` is re-authenticated and the owner approves.
Architecture: `docs/plans/2026-10-09-personal-finance-architecture.md`.

## How we work (copied from ROUTIQ, adapted)

- **Branches:** `main` = production, `develop` = staging. Never push either directly.
- **Branch names:** `<type>/<issue#>-<slug>` (`feat/`, `fix/`, `docs/`, `chore/`), cut from `origin/develop`, one worktree per worker. Update by merging `develop` in, never rebase or force-push.
- **Issues:**
  - An epic is a parent issue labelled `enhancement`. Its body: a 2–4 sentence goal, `## Slices (build order)`, `## Done when`, `## Open questions`.
  - Each slice is a sub-issue sized for one agent session. Its body, under 60 lines: `Part of #epic` · `## Problem` (with file:line) · `## Decision` · `## Acceptance criteria` · `## Guard test` · `## Definition of done` · `## Related`.
- **Labels:** exactly one category (`bug` or `enhancement`) and one state (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Claim a slice by assigning yourself as the first write.
- **Definition of done, every slice:**
  - `typecheck`, `lint:design` and `bun run test` pass, plus `test:convex` when `convex/` changes
  - fr and en keys added together
  - an `errors.<code>` key for each new `ConvexError` code
  - verified on the real artifact: device or sim for UI, a real low-end Android for native
  - a walkthrough recording for UI or native changes
- **PRs:**
  - Target `develop`, with a plain imperative title.
  - Body: What changed · Walkthrough · Merge danger (door, blast radius) · Found while testing · Independent review (author model, reviewer model, head SHA, verdict) · Checks.
  - Side findings become new issues, not extra diff.
- **Review:** a different model from the author. Opus 5.5 builds, Fable 5.1 reviews, with a PASS/FAIL per acceptance line. Approval holds only for the reviewed head SHA.
- **Merging:** merge commits only (`gh pr merge --merge --match-head-commit <sha>`). Only the owner merges, or an agent explicitly told to merge that PR. Issues are closed by hand after the merge into `develop`.
- **Release:** a PR from `develop` into `main`, titled "Release: <what> (YYYY-MM-DD)". The JS update is promoted with `eas update:republish` from `preview` to `production`.

## Milestones

| Milestone | Ships to staging | Contains |
|---|---|---|
| **M0 · Ground** | the current app, fixed, on the neutral look | E0, E1, E2 |
| **M1 · Cash-only ritual** | Moi/Nous + an evening cash count + the habit moment. Works on iOS and with SMS refused | E3 (core), E5, E6 (cash card + summary), E7.1–E7.3 |
| **M2 · SMS capture** | Orange/MTN SMS become movements; unknown and gap cards; suspect credits | E4, E6 (rest) |
| **Pilot** | 20–30 people, 4 weeks | release `develop` → `main` |

Gates:
- **E8.1** (SMS samples) gates E4.1.
- **E8.2** (the WhatsApp ritual test) gates M1's evening ritual: if fewer than 6 of 10 people complete 5 of 7 evenings, redesign before building E6.
- **The account-timing decision** gates E5.

## E0 · Workflow and environments
**Goal:** develop = staging and main = production work end to end.
1. **E0.1 Push the 22 local commits so `origin/main` matches local `main`.** `ready-for-human` (owner approves).
2. **E0.2 Create `develop`; protect `main` and `develop`.** One required `CI` check, conversations resolved, no force push. `ready-for-human`.
3. **E0.3 Deploy Convex staging from `develop` and prod from `main`.** Split `deploy-convex.yml`; add `develop` to `ci.yml` push branches.
4. **E0.4 Publish EAS Update `preview` on merge to `develop`; promote with `update:republish` on release.** Fingerprint check: OTA vs build.
5. **E0.5 PR template, labels, agent docs.** `.github/pull_request_template.md`, `docs/agents/review-workflow.md`, branch naming, Definition of done.
6. **E0.6 ADR-0001: develop is staging.** Decision, supersedes deployment-model §1–2, invariants, revert trigger (architecture doc §Environments).
7. **E0.7 Sentry performance traces.** Cold start, ingest, ritual; errors are already wired.

## E1 · Pilot blockers (2026-09-25 review)
**Goal:** the base app doesn't crash and doesn't hide its buttons.
1. **E1.1 Remove the `cssInterop` line that hides CTAs** (`soft-pressable.tsx:19`). Merge first.
2. **E1.2 Stop the Android launch crash** (`theme-preference-provider.tsx:56` → `'unspecified'`). Merge second.
3. **E1.3 Route treasurer confirmations to a live screen.**
4. **E1.4 Write `users.phone` so MoMo/OM work in real groups.**
5. **E1.5 Count cash roll-call ticks in the pot; warn when the pot is short.**
6. **E1.6 Add FCM (`google-services.json`) so Android gets push.**
7. **E1.7 Guard Android Back in Meeting Mode.**
8. **E1.8 Fix blank appearance labels on Android.**
9. **E1.9 Show the date picker in French.**

## E2 · Neutral design system
**Goal:** the app looks like the approved kit before any new screen.
1. **E2.1 Neutral token values in `mobile-ui-config.json`** (16 px state words, light by default).
2. **E2.2 System fonts; remove the 3 `@expo-google-fonts` packages; one money text style.**
3. **E2.3 Icons through `expo-symbols`** (`src/lib/icons.ts` + `ui/icon.tsx`).
4. **E2.4 Remove heroicons; rewrite the `lint:design` icon rule.**
5. **E2.5 Pictogram set as SVG components.** Placeholders until the owner decides on a custom set.
6. **E2.6 Commit the UI guide kit; settle the marigold hero rule.** `ready-for-human`.

## E3 · Money ledger core (server)
**Goal:** Convex holds a correct, deduplicated, private record of each person's money, fast to read.
1. **E3.1 Schema: pockets, moneyEvents (idempotency key + indexes), cashCounts, dailySummaries.**
2. **E3.2 Pure money logic with tests:** `balanceChain`, `dedupe`, `cashMath`, `summaryFold`.
3. **E3.3 `ingestEvents`: batched, idempotent, updates `dailySummaries` in the same transaction; server computes `day`.**
4. **E3.4 Classification:** user rules, merchant directory, confidence; directory votes through the scheduler.
5. **E3.5 Vos données backend:** export; batched delete-all; numbers hashed with a server key; no argument logging in `convex/money/`.
6. **E3.6 Retention purge cron.** Period from the lawyer (E8.4).

## E4 · Android SMS capture (M2)
**Goal:** Orange Money and MTN MoMo SMS become movements, with honest consent.
1. **E4.1 Parser with test cases** (pure TS in `src/lib/sms/`, covered by `bun run test`; templates as data). Blocked by E8.1.
2. **E4.2 Parser templates over the air:** `parserTemplates` table + device cache with a bundled floor.
3. **E4.3 Expo config plugin, sender allowlist in Kotlin, `allowBackup=false`, new preview build; iOS builds without the module.**
4. **E4.4 Read the SMS inbox from the 1st of the month with read cursors.**
5. **E4.5 New-SMS receiver feeding the outbox** (durable-queue, one scope per pocket).
6. **E4.6 Consent, Android's dialog, numbers found, third-SIM card** (Simple 2, 2b, 3, 3b).
7. **E4.7 Backfill progress; refused and stale states** (5d, 5e).
8. **E4.8 Play "SMS-based money management" declaration with a demo video.** `ready-for-human`; after E4.6.

## E5 · Moi and Nous shell (M1)
**Goal:** two tabs, a home that reads one document, the ledger one tap away. Blocked by the account-timing decision.
1. **E5.1 Moi and Nous tabs replace Aujourd'hui · Groupes · Actions;** deep links and attention routing move to Nous.
2. **E5.2 Moi home:** today's spending, pockets behind the eye, states 5, 5b, 5c; first-run state for existing njangi users.
3. **E5.3 Cold start from a local home snapshot.**
4. **E5.4 Pocket ledger:** FlashList, paginated; money line; fix a movement.
5. **E5.5 Vos données screen.**

## E6 · Le point du soir
**Goal:** a short evening that ends with "C'est juste ?", saved card by card, offline-safe. Gated by E8.2.
1. **E6.1 `tonightsCards` (derived) and `answerCard`** (M1: cash only; M2: plus unknown and gap cards).
2. **E6.2 StoryDeck ritual route** (`fullScreenModal`, swipe off; ✕ and "Pas ce soir" keep answers).
3. **E6.3 Cash card with BanknoteCounter:** "Normalement" from `cashMath`; first count; more cash than expected.
4. **E6.4 "C'est juste ?" summary with tap-to-fix.**
5. **E6.5 Unknown and gap cards** (M2).
6. **E6.6 Suspect credit:** "À vérifier" → #150# → "L'argent est là ?" → alarm (M2).

## E7 · Habit (M1)
**Goal:** people pick their moment and are carried through their first 7 evenings.
1. **E7.1 "Quand faites-vous le point ?" moment picker + local reminder.**
2. **E7.2 "7 soirs pour voir clair":** day-by-day content, 7 circles, graduation. Kept in Phase 1 by owner priority (Fable suggested cutting it).
3. **E7.3 Catch-up instead of guilt ("2 soirs à rattraper", "5 soirs sur 7") + a server nudge after 3 silent evenings** (needs E1.6).

## E8 · Phase 0 research (people)
All `ready-for-human`.
1. **E8.1 Collect 300–500 consented SMS; anonymize them into parser test cases.**
2. **E8.2 WhatsApp ritual test.** 10 people, 7 evenings, chosen moment. Go/no-go: at least 6 complete 5 or more.
3. **E8.3 Paper tests:** banknotes vs keypad; pictogram naming; Android "envoyer" wording; French TTS voices on low-end Android.
4. **E8.4 Lawyer opinion:** read-only status, the Law 2024/017 checklist, retention period.
5. **E8.5 Operator emails to Orange and MTN.** The owner sends them or approves the text.

## Moved to Phase 2
- Sunday report and budgets on the 1st (the old E7.4)
- 🔊 text-to-speech (the old E5.5), until E8.3 confirms French voices work
- voice input
- iOS paste and screenshot import
- "Papier" debts (needs the web-link decision)
- household mode
- the Android widget and binôme
- a WhatsApp channel
