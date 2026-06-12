# MVP Build Plan & Validation

## A. Ruthless Scope Table

### MUST (solo-buildable in 4–6 weeks)

| # | Feature | Notes |
|---|---------|-------|
| M1 | Auth (Clerk) + user profile (name, phone, preferred language) | Phone number is the identity members recognize; Clerk owns identity, Convex owns authorization |
| M2 | Group creation + member invites (link/code), roles: president / treasurer / member; president can reassign the treasurer role (handover statement per 02 §treasurer-replacement) | Treasurer can add feature-phone members by phone number only (no account, `hasAccount: false`) |
| M3 | Cycle + Round engine: locked rotation order, fixed contribution amount, schedule (weekly / biweekly / monthly), current beneficiary always visible | Order is immutable, but entries can be marked **skipped** (member exit/death/expulsion — see 02 edge cases), and the president may swap two **future** beneficiaries via an `OrderChange` record (president-only, mandatory note, group-visible — the common "begging the turn" practice, per 02 §rotation-order); joins take effect next cycle. Beneficiary contributes in their own round by default (standard njangi) |
| M4 | PaymentRecord state machine per 02: records **pre-created as `pending` at round open** (powers Meeting Mode roll-call + entry metric); pending → claimed → confirmed (= ledger-final, **derived** per 01 §3.2 — never stored); disputed has exits (payee late-confirms → confirmed; payer withdraws → cancelled; president override with mandatory note). The **only** exit from `confirmed` is the president override-cancel per 02 transition 12 (error reversal — mandatory note + immutable override record); without it a Meeting Mode fat-finger that auto-confirms at `T_AUTO_CONFIRM` would be permanently uncorrectable | Kinds in MVP: `contribution`, `payout`, `fine` (manual, see M14), `assistance` (manual levy, see M15). Truth = payee confirmation |
| M5 | Methods: `momo_mtn`, `orange_money`, `cash` + USSD step-by-step instruction screens (*126# / #150#) | Instructions only; app never calls payment APIs. Proof: MoMo txn ID (nudged) or screenshot (stored, untrusted) |
| M6 | Meeting Mode: treasurer roll-call, prefilled amount, tick-as-cash-arrives, ~20 entries in 2 min, batch-creates claimed PaymentRecords, members push-notified to confirm | The killer cash feature; optimistic UI, works on flaky connection |
| M7 | Activity feed per Group: who claimed, who confirmed, payouts, round opened/closed | Immutable, visible to all members of the Group |
| M8 | Payout flow: treasurer claims payout to beneficiary, beneficiary confirms (same reversed handshake, cash or MoMo). Payout amount **prefilled from the expected pot** (members × contribution, per 02 §b's pre-created payout record), **editable by treasurer at claim time** — the recorded amount is what was actually handed over (record reality, don't assert; also safer under R4/R7). Rounds close **per 02 §b: system-driven at `graceEndAt`, no human gate** (earlier only when all contribution records are terminal); a shortfall simply means unpaid records stay open as arrears (shown in round summary), and the payout is claimable any time after round open, so the beneficiary never waits on close | Feature-phone beneficiary: president confirms on their behalf, logged as such, feed-labeled "attesté" — no deadlock |
| M9 | Dispute basics per 02: **payer-side** claims unconfirmed past `T_AUTO_DISPUTE` (72h, per 02's timer table) auto-flag `disputed`; **payee-side** claims (Meeting Mode, beneficiary "j'ai reçu") auto-confirm after silent objection window (`T_AUTO_CONFIRM`) — feature-phone cash entries never rot. Resolution: payee late-confirm, payer withdraw, president override | Full evidence-thread UI stays LATER (L1) |
| M10 | Round summary auto-generated + WhatsApp share — text + deep link (`njangi://` scheme, store-link fallback for recipients without the app; **no web summary page**, per the 2026-06-11 mobile-only decision) | Distribution loop: every round summary markets the app inside the group's existing WhatsApp |
| M11 | fr/en i18n, French primary copy | i18next, fr default, en fallback — copied from piol-vite |
| M12 | Notifications: **in-app inbox is the guaranteed channel**; **expo-notifications native push** layered on top (token + send pipeline built Week 3, see note there). Reminders: contribution due, confirmation pending, round closing | SMS is LATER (L6) |
| M13 | Reliability score v1: per-member on-time % within a group, measured on `claimedAt` (when money changed hands), not `confirmedAt` — per 02 §obligation-status. Feature-phone members score normally via treasurer's payee-side logging | v1 is a dumb ratio; cross-group portability is LATER |
| M14 | Manual fine entry: treasurer drafts member + amount + reason at the réunion; **president confirms with one tap** (president-confirmed, never auto-charged, per 02 §f — fines carry the president's/assembly's authority, the treasurer merely collects) → ordinary `kind: fine` PaymentRecord, same claim/confirm collection handshake, Meeting-Mode tickable | ~1 day (schema already has the kind); automation stays L2. Pilot promise "fines respected" depends on this |
| M15 | Minimal assistance levy entry: president launches (or treasurer drafts for the president's one-tap confirmation) an `AssistanceLevy` — label (e.g. « deuil », « mariage »), amount-per-member, exclusions — per 02 §f's last paragraph: the fine machinery minus the proposal step; generates `kind: assistance` PaymentRecords with the same handshake | ~1 day like M14 (schema + state machine already exist). A bereavement is near-certain across 5 groups over the pilot, and assistance is core njangi practice (locked decision 7) — without this, treasurers must mislabel a deuil as an « amende » or revert to the notebook, contaminating kill-signal 4. Levy progress UI + exclusion edge cases stay L3 |

### LATER (each demotion justified in one line)

| # | Feature | Why demoted |
|---|---------|-------------|
| L1 | Dispute resolution UI beyond basic flag (evidence threads, group votes, mediation) | Disputes should be rare in pilot groups that already trust each other; the flag + WhatsApp resolves it for now |
| L2 | Fines automation (auto-assess lateness, configurable fine rules) | Treasurers can log a fine as a manual PaymentRecord (`kind: fine`) in MVP; automation needs observed real-world fine rules first |
| L3 | AssistanceLevy flows beyond minimal entry (levy progress UI, exclusion edge-case handling, recurrence/automation) | Minimal levy launch is M15; the richer UI waits until the core rotation loop is validated |
| L4 | ReliabilityScore v2 (cross-group portable, weighted, fraud-resistant) | Portability only matters once members exist in >1 group on the app — impossible before month 2 |
| L5 | Premium billing (CamPay PSP, treasurer pays 1,000–2,500 FCFA/month) | Charging before retention is proven wastes the pilot; pilot groups get premium free for the cycle (capped at 6 months — see §C) |
| L6 | SMS reminders + SMS receipts to feature-phone members | SMS costs money per message and needs a gateway; push + treasurer's voice covers the pilot |
| L7 | Exports / PDF reports | Treasurers keep the paper notebook in parallel during pilot anyway; exports matter at cutover, not at validation |
| L8 | Loans-within-group recording | Real need (decision 7) but a separate ledger domain; do not let it blur the contribution/payout core |
| L9 | Variable contribution amounts per member | Fixed amount covers the dominant njangi format; variable doubles round-math edge cases |
| L10 | `bank` method | Per locked decision 3, bank is "later"; pilot groups use MoMo and cash |

### NEVER

| Feature | Reason |
|---------|--------|
| Custody / holding member money in any form | Locked decision 1; CEMAC 04/18 + May-2025 enforcement = existential risk |
| Payment APIs that move member money (MoMo/OM disbursement or collection APIs for contributions/payouts) | Same; only exception ever is the app's own subscription fee via licensed PSP (CamPay), where the app is the merchant |
| Lending, float, advances, app-brokered credit of any kind | Locked decisions 1 & 8 |
| Trusting proof artifacts as truth (OCR-ing screenshots, auto-confirming from txn IDs) | Locked decision 2: payee confirmation is the only truth |

## B. Week-by-Week Build Order

Dependency spine: **schema → auth → groups → rotation → PaymentRecord → claim/confirm UIs → Meeting Mode → feed/share → polish**. Each week ships something demoable. Reuse piol-vite files verbatim where listed (paths relative to `/Users/linusbayere/Developer/work/truesignaldigital/piol-vite/`).

### Week 0 (2–3 days, can overlap Week 1): Project scaffold by copy
**(2026-06-11 mobile pivot: scaffold source is `piol-vite/apps/mobile`, and the repo is ALREADY converted to Expo — this step is verification, not greenfield.)**
- Expo (React Native) scaffold following `piol-vite/apps/mobile` patterns:
  - Expo Router shell: `app/_layout.tsx` (ClerkProvider → ConvexClientProvider → shell) with `(auth)` / `(app)` route groups; theme + language persisted via AsyncStorage keys `njangi-theme` / `njangi-language`
  - `src/lib/i18n.ts` + locale config (keep `appLocales = ['fr','en']`, fr default, en fallback) + `src/i18n/locales/{fr,en}.json`
  - `convex/utils/auth.ts` unchanged (`getCurrentUser` / `getCurrentUserOrNull` / `requireAuthOrDefault`, `by_clerk_id` resolution)
  - NativeWind + theme tokens as styling starting point, `scripts/lint-design-system.ts`, piol-vite mobile UI component set
  - `app/(app)/_layout.tsx` layout-auth pattern (Clerk `useAuth()`, skeleton while `!isLoaded`, redirect to the `(auth)` sign-in group)
  - `convex/http.ts` Clerk webhook + `useEnsureUser()` client fallback
  - EAS config (`eas.json`): dev-client + internal-distribution build profiles for Android AND iOS from day one
- Convex deployment is njangi's own — `resolute-rooster-437`, unchanged by the pivot (do NOT share piol's).
- **DECISION:** new standalone repo, not a piol-vite branch — different product, different deployment, no shared domain types worth a workspace yet.

### Week 1: Schema + auth + groups
- `convex/schema.ts` (single file, piol conventions): tables `users`, `groups`, `memberships` (role validator: `v.union(v.literal('president'), v.literal('treasurer'), v.literal('member'))`), `cycles`, `rounds`, `paymentRecords`, `activityEvents`. Named exported validators: `paymentRecordStateValidator` (`pending|claimed|confirmed|disputed|cancelled` — **five literals; ledger-final is derived (confirmed + round closed) per 01 §3.2, never stored**; this is the canonical validator name — align 01's `paymentStateValidator` and 02's `paymentRecordStatusValidator` references to it), `paymentRecordKindValidator` (`contribution|payout|fine|assistance` — kinds fine/assistance in schema now, UI per M14/M15), `paymentMethodValidator` (`momo_mtn|orange_money|cash|bank`). Timestamps as `v.number()` ms with `At` suffix (`claimedAt`, `confirmedAt`, `disputedAt`); indexes `by_group`, `by_group_and_round`, `by_membership`, `by_clerk_id`.
- `convex/groups.ts`, `convex/memberships.ts`: create group, invite code join, treasurer adds feature-phone member (phone only, `userId` optional on membership). Every function declares `args:` AND `returns:` validators with named result consts; no doc spreading.
- Routes: sign-in/up (copy `sign-in.$.tsx` pattern), group create, group home shell.
- **Verify Clerk SMS OTP delivery on real MTN and Orange Cameroon SIMs** (04's research flag) and decide the WhatsApp-OTP fallback now — phone-number identity is the single point of failure for onboarding; group #1's in-person sign-up fails live if OTPs don't arrive at the réunion.
- **Demo:** create a group, invite a member, see member list with roles.

### Week 2: Cycle/Round engine + PaymentRecord state machine
- `convex/cycles.ts`: start cycle = lock rotation order (drag-to-order then lock; entries skippable per M3, order itself immutable), fixed amount, schedule; plus the `OrderChange` swap mutation (two **future** beneficiaries, president-only, mandatory note, group-visible feed event) per M3 / 02 §rotation-order. `convex/rounds.ts`: open round (**pre-creates all `pending` PaymentRecords**: one contribution per active member + the payout record — powers Meeting Mode prefill and the entry metric), current beneficiary; **rounds close per 02 §b: system-driven at `graceEndAt`, no human gate** (earlier only when all contribution records are terminal — impossible while a shortfall leaves pendings open); shortfall handling = the system's frozen obligation statuses + arrears records staying open, and the payout is claimable from round open so the beneficiary never waits on close. Close implements 02's closing rules **steps 1–3 and 5 only**; step 4 (fine auto-proposals) is L2 and excluded — fines in MVP are entered manually per M14.
- `convex/paymentRecords.ts`: the state machine as mutations — `claim` (payer-side, or payee-side for Meeting Mode/beneficiary receipt), `confirm` (counterparty only; president may act for `hasAccount:false` party, logged as such), `cancel` (allowed from `claimed`/`disputed` **by the claimant only** — the president, not the treasurer, may act for `hasAccount:false` parties, logged as such, per 02 transition 8; from `confirmed` only via the **president override-cancel of 02 transition 12**: mandatory note + immutable override record, the error-reversal path for wrongly-confirmed records), plus `convex/lib/paymentStateMachine.ts` as pure logic with colocated `paymentStateMachine.test.ts` (piol's `convex/lib/` + colocated test pattern). Confirm/cancel are idempotent no-ops when already in target state (Convex serializes mutations — handles concurrent confirms).
- Self-records: records where `payerMembershipId == payeeMembershipId` (the treasurer's own contribution; the payout when the treasurer is the round's beneficiary) are **claimed-and-confirmed in a single mutation** — no timers, no counterparty — feed-labeled « auto (trésorier — propre cotisation) » so the group sees them; asserted in the colocated state-machine tests and the 2-member Playwright spec (Week 6).
- **Idempotency DECISION:** client-generated UUID per claim/tap stored on paymentRecords with `by_idempotency_key` index; mutations no-op on key collision. Partial top-up = a second `claimed` record with its own key; member row shows sum vs expected.
- `convex/crons.ts`: a **single cron running every 15 minutes** per 02's timer table (a daily cron would stretch the 48h `T_AUTO_CONFIRM` objection window unpredictably toward ~72h) — **payer-side** `claimed` records → `disputed` at `T_AUTO_DISPUTE`; **payee-side** claims auto-confirm at `T_AUTO_CONFIRM` (silent objection window, per 02). **DECISION:** `T_AUTO_DISPUTE` = 72h for **both** contribution and payout claims, citing 02's timer table — one source of truth; if pilot data shows payouts need a longer window, add a `T_AUTO_DISPUTE_PAYOUT` constant to 02's table first, never fork constants here.
- Activity events written by every state transition (enrichment pattern: `Promise.all` joins for actor/group names).
- **Demo (CLI/dashboard-level):** full pending→claimed→confirmed walk in Convex dashboard; ledger-final is derived (confirmed + round closed) per 01 §3.2, not a stored state or transition.

### Week 3: Member claim/confirm UI + methods + USSD screens
- Round screen: "your contribution this round" card → claim flow: pick method → method-specific screen. MoMo/OM screens show step-by-step USSD instructions (*126# MTN / #150# Orange) with treasurer's number prefilled and copy button, plus a « Composer le code » button that deep-links the dialer (`tel:` URL with the `#` percent-encoded, e.g. `tel:*126%23` — a native-only win over the old web plan), then "I've sent it" → optional txn ID field (nudged) or screenshot upload (`ctx.storage`, labeled "for dispute resolution only"). Cash: claim with no artifact.
- Treasurer inbox: pending confirmations list, one-tap confirm. (Payout flow moved to Week 4 — it reuses these claim/confirm components, isn't needed until the first round closes, and Week 3 is the plan's most loaded week.)
- Data layer: NO route loaders — Convex `useQuery()` in components. (Prewarm siblings — `app/routes/-group.data.ts` etc. via `src/lib/convexRouteData.ts` + `src/lib/useRoutePrewarmIntent.ts` — demoted to Week 6 polish: a perf nicety, not MVP-critical for 15–40-member groups.)
- i18n: all strings into `fr.json`/`en.json` simultaneously, French written first as primary copy. `formatCurrencyXAF`-style helper (copy from piol's i18n-format).
- **Push infrastructure** (moved up from Week 5 — Week 4 Meeting Mode depends on it): **expo-notifications** native push (replaces the old web push / VAPID / service-worker plan), Expo push tokens stored in the `pushTokens` array on `users` (per 01's DECISION — a subscription table is overkill for MVP), Convex send pipeline calling the Expo push API, in-app notification inbox as the guaranteed fallback. Demoable here via the confirmation-pending reminder. Native push via Expo (APNs/FCM credentials handled by EAS) is 1–2 days — budgeted now, not crammed into Week 5.
- **Demo:** end-to-end contribution on a phone, both MoMo and cash, with push-confirmed handshake.

### Week 4: Meeting Mode + payout flow + activity feed
- Meeting Mode (treasurer-only route): roll-call list prefilled from the round's **pre-created `pending` records**, tap = payee-side claim (treasurer attests receipt), long-press to edit amount (partial payment **DECISION:** allowed, recorded with actual amount + own idempotency key; shortfall = sum vs expected on member row). Target: 20 entries in 2 minutes (hard acceptance test).
- Payout flow (treasurer claims → beneficiary confirms), reusing the Week 3 claim/confirm components with payer/payee swapped — **moved here from Week 3**: it shares Meeting Mode's components and isn't needed until the first round closes.
- **Offline DECISION (scope guard):** "offline queue" = Convex's built-in in-memory mutation queue + optimistic updates, with the unsynced tap queue (a tiny array of `{recordId, idempotencyKey, amount, ts}`) **persisted to `AsyncStorage`** (mobile pivot: was `localStorage`) and replayed on next open with a « X entrées récupérées » toast — hours of work, not an offline-first store. This matters because Android kills backgrounded apps aggressively on the ≤2GB-RAM target device and a treasurer WILL switch to WhatsApp or the phone app mid-réunion; an in-memory-only queue would lose taps silently while the treasurer believes entries were recorded. The visible "N en attente de synchro" counter in Meeting Mode stays. NOT a SQLite/offline-first store (that alone busts the 4–6 week window).
- Smartphone members get push with an **objection window** (payee-side claim → auto-confirm on silence at `T_AUTO_CONFIRM`, per 02 — this is what makes 20-entries-in-2-min safe without 20 manual confirmations). Feature-phone members: same auto-confirm path; SMS receipt is L6 — during pilot their receipt is the **réunion itself plus the treasurer's voice/WhatsApp relay of the round summary** (they cannot see the in-app feed), so Meeting Mode's close step prompts the treasurer to **read out the auto-confirmed entries for feature-phone members** (also on the treasurer one-pager); they are exempt from any payer-side auto-dispute (their entries are payee-side by construction). (Align 02: its "SMS receipt to feature-phone" notification rows are L6/premium, not MVP.)
- Activity feed: reverse-chron per group, memoized list cards with narrow data interfaces (piol `PropertyCardData` pattern), tiny payloads (paginated query).
- **Demo:** simulated réunion: 20 members logged in under 2 minutes on a mid-range Android; payout claimed and confirmed; kill the app mid-roll-call, reopen, zero lost entries (AsyncStorage replay).

### Week 5: Round summary + WhatsApp share + reminders + reliability v1
- Round close (system, per 02 §b) → auto-generated summary (who paid, method, fines logged, payout confirmed) as shareable French/English text block + `njangi://` deep link with store-link fallback for recipients without the app (**no web summary page** — 2026-06-11 mobile-only decision; https universal links later); share via the native share sheet, `https://wa.me/?text=` as the direct WhatsApp target.
- Manual fine entry + minimal assistance levy launch forms (M14/M15) — ~2 days combined, schema kinds already exist; must ship before the first deuil, not necessarily before group #1's first réunion.
- Reminder crons via `convex/crons.ts` (the single 15-minute cron, pipeline already built Week 3): due contributions on schedule day, unconfirmed claims at 24h/48h.
- Reliability score v1: on-time (by `claimedAt`) ÷ rounds elapsed, per membership, simple badge. Feature-phone members included (payee-side logging counts).
- Basic dispute surfacing: disputed records get a red row in feed + "raise issue" button anywhere.
- **Half-day:** `/admin/pilot` metrics dashboard — copy piol's `src/lib/analytics.ts` shape, one Convex query per kill-signal metric, one plain table per group. Keep it ugly — internal only. (Launch-checklist gate; must exist before group #1.)
- **Demo:** full round lifecycle ending in a WhatsApp-shared summary.

### Week 6: Hardening + pilot prep
- Offline/slow-network pass (throttle to 3G in devtools; every mutation optimistic; skeletons everywhere via the dashboard-shell pattern), empty states, error toasts (sonner), design-system lint clean. Device test on the launch-checklist Android: **kill the app mid-roll-call, reopen, verify zero lost entries** (AsyncStorage tap-queue replay from Week 4).
- Prewarm siblings (`-group.data.ts` + `useRoutePrewarmIntent`, copied from piol-vite) as polish only if the week has slack — demoted from Week 3.
- Seed script (`convex/seed/`) creating a realistic demo group for treasurer demos, **plus a 2-member group and a max-size (40) group** — both exercised by the Playwright smoke specs.
- **Group size DECISION:** MVP hard cap 40 members per group (pilot groups are 15–30, so zero friction); creation/joins rejected above cap. Premium "larger groups" (L5) raises it later.
- **EAS builds for pilot distribution (replaces the old PWA-install items):** Android build on the Play Store **internal testing** track + iOS build on **TestFlight** — Play internal testing is faster than full store review; APK direct-install to pilot groups is the acceptable fallback if Play access lags. Store metadata (name, description, screenshots) in fr AND en on BOTH stores, French primary.
- Legal disclaimer screen + onboarding copy (see launch checklist). Playwright smoke specs in `e2e/` for the claim/confirm happy path, Meeting Mode, and the self-record path (payer == payee) in the 2-member group.
- Onboard pilot group #1 in person; fix what breaks for 2–3 days before groups #2–5.

## C. Validation Protocol

### Recruiting 5 real Groups (Douala/Buea)

**Targets:** 2 church njangis, 1 office, 1 quartier, 1 **market (bayam-sellam) tontine in Douala** — the alumni slot is given up for it: office and alumni groups are the most literate, smartphone-saturated segments, and a pilot without a market group never samples the low-literacy, feature-phone-dense, cash-dominant user the UX bar (and the "confirmation too hard for low-literacy users" decision rule) is calibrated against. Accept the harder recruiting; if a market group is genuinely unreachable through contacts, fall back to alumni **and state explicitly in the pilot log that the pilot validates the smartphone-literate segment only, with the treasurer-only pivot as the expected mode for market groups**. Via existing personal contacts first, then referrals from those treasurers. The treasurer is the buyer (decision 5); never pitch members directly.

**Cycle-length bound (recruiting criterion):** the cycle-end checkpoint must actually arrive. At 15–30 members, a monthly njangi's full Cycle is 15–30 **months** — unreachable in any realistic solo-dev pilot horizon. So: prefer weekly/biweekly groups; ensure **≥2 weekly groups** so at least two full rotations complete within ~6 months (this is what satisfies locked decision 11's "one full rotation observed"); admit a monthly group **only if small (≤8 members)**; and any group whose full Cycle exceeds the pilot horizon is **excluded from the cycle-end PERSEVERE denominator** and judged instead at an interim checkpoint: its decision data freezes at **min(full Cycle, 10 rounds, 5 months)**, plus the round-3 KILL signals.

**Approach script (French, in person or WhatsApp voice note — Douala pitches should say « tontine (njangi) », the term most Douala francophones use):**

> « Bonjour [nom]. Je développe une application pour les njangis — pas pour toucher à l'argent, l'argent continue de passer par MoMo, Orange Money ou en cash comme d'habitude. L'application remplace seulement le cahier : qui a cotisé, qui a reçu, l'ordre de passage, les rappels automatiques. Chaque membre confirme lui-même ce qu'il a reçu, donc plus de palabres sur "j'ai payé / tu n'as pas payé". Je cherche 5 groupes sérieux à Douala et Buea pour tester gratuitement pendant un cycle complet. En échange, je viens à votre réunion, je configure tout moi-même, et je suis disponible sur WhatsApp à tout moment. Est-ce que je peux venir vous montrer 10 minutes à votre prochaine réunion ? »

**Approach script — English/Pidgin variant (Buea):** Buea is in the Anglophone Southwest — pitch in English/Pidgin, where the practice is called "njangi", not « tontine » :

> "Hello [name]. I'm building an app for njangis — not to touch the money. The money still moves by MoMo, Orange Money or cash, same as always. The app only replaces the notebook: who has contributed, who has received, the order of collection, automatic reminders. Each member confirms with their own hand what they received, so no more palava about 'I paid / you no pay'. I'm looking for 5 serious groups in Douala and Buea to test it free for a full cycle. In exchange, I come to your meeting, I set everything up myself, and I'm on WhatsApp any time. Can I come show you for 10 minutes at your next meeting?"

Key reassurance to repeat verbatim: **« L'application ne touche jamais à l'argent. » / "The app never touches the money."**

**What to offer:** free premium for the full Cycle, **capped at 6 months**; in-person setup at their réunion (you create the Group, enter members, lock rotation order with them watching); dedicated WhatsApp support; their fines/levy rules respected — logged in-app via manual fine entry (M14) and assistance levy entry (M15), never off the books; explicit promise they can export/keep their data if they quit.

**What to ask (intake interview, ~20 min with treasurer):** member count and how many are smartphone vs feature-phone; schedule (weekly/biweekly/monthly) and fixed contribution amount; cash vs MoMo split last round; **how money physically reaches the beneficiary — collected by the treasurer then handed over, or sent member-to-beneficiary directly** (the model supports the treasurer-mediated flow per 01's I-5: screen for it, and record direct-to-beneficiary groups as a known model limitation — a future relaxation of I-5 in 01 — rather than discovering it in round 1); how disputes happened in the past 12 months and how they were resolved; fine rules; **how their assistance/levy rules work** (deuil, mariage: amount per member, who is exempt, who decides); how the notebook is kept today and who can see it; whether the group has a WhatsApp group (it will — get added to it).

### Instrumented metrics (one per kill-signal)

Instrument via Convex `activityEvents` + a lightweight `analytics` events table (piol has `src/lib/analytics.ts` — copy the shape). Dashboard: a simple internal route `/admin/pilot` querying these per group per round.

| Kill-signal | Metric | Green threshold |
|---|---|---|
| Treasurers won't do data entry | % of the round's pre-created `pending` contribution records claimed within 48h of due/réunion date (beneficiary's own record included — they contribute in their own round per M3) | ≥ 80% |
| Members don't check app | % of smartphone members with ≥1 app open per week — instrumented as an `app_open` analytics event fired whenever the app comes to the **foreground** (AppState → `active`), not just cold launch (feature-phone members excluded from denominator) | ≥ 50% |
| Ledger doesn't reflect reality | Dispute rate = records that **ever entered `disputed`** ÷ records that reached `claimed`, per group per round (confirmed→disputed exists in no machine — disputes precede confirmation — so "% of confirmed later disputed" would always read green); plus a separately tracked **count of president override-cancels of `confirmed` records** (02 transition 12) | Dispute rate ≤ 20% (target ≤ 5%); override-cancels ≤ 1 per group per cycle |
| Groups revert to WhatsApp + notebook | Groups still logging every round in-app after 1 full Cycle (or the interim checkpoint for slower groups, per the cycle-length bound) | 4 of 5 groups |

Secondary signals (record, don't gate on): Meeting Mode time-per-entry; % MoMo claims with txn ID attached; median claim→confirm latency; WhatsApp summary share rate per round.

### Weekly check-in cadence

- **Weekly, per treasurer (10-min WhatsApp call or voice notes):** What was annoying this round? Did anything go back to the notebook? Any member complaint? One thing to add, one to remove.
- **Weekly, internal (solo, 30 min, written):** update metrics dashboard numbers into a running log in the repo (`docs/pilot-log.md`); triage bugs; pick max 3 fixes for the week. Pilot bug-fixing is capped at ~50% of dev time to protect against burnout (risk R8).
- **Per réunion, first round of each group:** attend in person (Douala/Buea), observe Meeting Mode silently, time the roll-call.
- **Monthly:** 3 member-level interviews (not treasurers) per city — do members actually look at the feed, or do they trust the treasurer and ignore the app?

### Decision rules after one full Cycle (the checkpoint that counts; groups whose Cycle outruns the pilot horizon freeze at the §C interim checkpoint — min(full Cycle, 10 rounds, 5 months))

- **PERSEVERE** — all four green thresholds met in ≥4/5 groups → start LATER tier (premium billing L5 first: ask pilot treasurers to pay 1,000 FCFA/month from cycle 2; ≥3/5 paying = monetization signal), recruit next 20 groups via treasurer referrals.
- **PIVOT** — entry happens (≥80% logged) but members don't engage (<50% weekly opens) in ≥3 groups → pivot to **treasurer-only tool**: drop member accounts, double down on Meeting Mode + WhatsApp-broadcast summaries; members consume via WhatsApp, never install. **DECISION:** this is the pre-declared pivot, chosen now to avoid post-hoc rationalization.
- **PIVOT** — members engage but the dispute rate (as redefined above: records ever entering `disputed` ÷ records reaching `claimed`) >20% → the confirmation handshake is misdesigned; redesign confirm UX (likely: confirmation too hard for low-literacy users) before adding anything.
- **KILL** — ≥3/5 groups revert to notebook + WhatsApp mid-cycle despite weekly support, OR treasurer logging <50% in ≥3 groups by round 3 (don't wait for cycle end), OR any group quits citing "WhatsApp is enough" AND metrics agree → stop, write the post-mortem, do not raise scope to "fix" adoption with features.
- Tie-breaker rule: metrics decide, anecdotes don't. A treasurer saying "we love it" with 40% logging is a KILL data point, not a PERSEVERE one.

## D. Risks Register (top 8)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | **Adoption fails** — members never open the app, treasurer is the only user | High | High | Pre-declared pivot to treasurer-only tool (see decision rules); WhatsApp share on every round summary so members get value without installing; measure weekly, decide at cycle end, not later |
| R2 | **Treasurer churn** — champion treasurer gets busy/leaves and the group's usage dies | Medium | High | President reassigns the treasurer role (M2; handover statement per 02 — open records re-pointed, confirmed history keeps the old treasurer); setup is done by us in person so re-onboarding a replacement takes one réunion. ("Deputize any member" for Meeting Mode = LATER, not MVP) |
| R3 | **MoMo/OM USSD menu changes break instructions** (*126# / #150# flows change) | Medium | Medium | USSD instructions stored as versioned Convex data, not hardcoded in the client — updatable without app release; monthly manual verification on real MTN + Orange SIMs; instructions framed as guidance ("menus may vary") not gospel |
| R4 | **Regulatory drift** — ledger/proof features reinterpreted as payment facilitation under CEMAC 04/18 enforcement | Low | Existential | Custody-free by architecture (no payment APIs touch member money — nothing to shut down); local counsel review of disclaimer + product description pre-launch (see checklist); avoid any marketing language like "send money", "collect payments"; only PSP integration ever is CamPay for our own subscription fee |
| R5 | **"WhatsApp is enough"** — groups get 80% of the value from a pinned WhatsApp message | High | High | This is the named real competitor (decision 11); the wedge is what WhatsApp can't do: immutable history, two-sided confirmation, locked rotation, reliability score; if pilot proves WhatsApp wins anyway → KILL rule fires, that's the protocol working |
| R6 | **Seasonality** — njangi intensity swings (December payouts, school-fee season, lean months); pilot cycle may be unrepresentative | Medium | Medium | Stagger the 5 groups across weekly/biweekly/monthly schedules so cycles complete at different calendar points (within the §C cycle-length bound, which keeps every group's checkpoint inside the pilot horizon); record seasonal context in pilot log; don't extrapolate revenue from a December cycle |
| R7 | **Trust incident** — a dispute, fraud, or treasurer absconding gets blamed on the app ("the app said it was paid") | Low | High | The app never asserts payment happened — UI language always "X confirmed receiving" (payee confirmation = truth, decision 2); screenshots explicitly labeled non-authoritative; disclaimer on every group join; in a pilot incident, show up in person — handled well, a dispute resolved BY the ledger becomes the best marketing |
| R8 | **Solo-dev burnout** — building, supporting 5 groups on WhatsApp, and attending réunions in two cities simultaneously | High | High | Scope table is the contract: no LATER item starts before cycle-end decision; support hours batched (2 windows/day, stated in pilot WhatsApp groups); week 6 hardening exists to reduce support load; pilot capped at 5 groups no matter how good referrals are; weekly written log doubles as forced reflection checkpoint |

## E. Launch Checklist (pilot launch, end of Week 6)

**Legal / positioning**
- [ ] Disclaimer text reviewed by Cameroon-licensed counsel: app is a record-keeping tool; never initiates, executes, processes, or intermediates transfers; provides general guidance for transactions members perform themselves on their own MoMo/Orange Money accounts or in cash — counsel finalizes from this accurate baseline (the cruder "never instructs the transfer of funds" would visibly contradict M5's USSD instruction screens); fr + en versions
- [ ] Disclaimer shown at group join and in footer of every shared round summary
- [ ] Product copy audit: zero occurrences of banned custody terms in UI strings, per 04's bilingual banned-terms list (rules 3 + 7: fr — « solde », « portefeuille », « déposer », « retirer des fonds », « recharger », « envoyez de l'argent via », « payez dans l'application »; en — "send money", "collect", "wallet", "payment processing", etc.), maintained as the single list in `scripts/custody-copy-allowlist.json` and scanned over `src/i18n/locales/*.json` by the design-system lint script in CI
- [ ] Counsel sign-off that ReliabilityScore display doesn't constitute credit scoring under local rules (**DECISION:** if ambiguous, ship v1 visible only inside the member's own group)

**App / infra**
- [ ] Production Convex deployment + Clerk production instance (separate from dev), env vars set
- [ ] EAS builds live: Android on the Play Store internal testing track + iOS on TestFlight (Play internal testing is faster than full review; APK direct-install acceptable fallback for pilot groups); tested on low-end Android (≤2GB RAM) over throttled 3G; Meeting Mode passes 20-entries-in-2-minutes on that device; kill-the-app-mid-roll-call test on that device recovers all queued entries (AsyncStorage replay, Week 4)
- [ ] `convex/crons.ts` 15-minute cron (auto-dispute, auto-confirm, reminders) verified in production
- [ ] Error tracking + the `/admin/pilot` metrics dashboard live before group #1 onboards
- [ ] Seed/demo group available for in-réunion demos
- [ ] Store metadata on BOTH stores (Play + App Store): name, description, screenshots in fr AND en; French listing is primary — **DECISION (2026-06-11 pivot):** pilot distribution = Play internal testing + TestFlight (or APK direct-install for pilot groups); full public store release deferred to PERSEVERE

**Pilot operations**
- [ ] One WhatsApp support group per pilot Group (treasurer + president + you), plus one cross-group treasurers channel
- [ ] Onboarding one-pager (French, printable; English/Pidgin version for Buea) for treasurers: the handshake explained in 5 steps with screenshots, including the Meeting Mode close step — read out auto-confirmed entries for feature-phone members
- [ ] USSD instruction content verified on live MTN and Orange SIMs within 7 days of launch, including the `tel:` deep-link dial buttons (`#` must be percent-encoded as `%23` or the dialer truncates the code)
- [ ] OTP sign-up verified on live MTN + Orange SIMs within 7 days of launch (mirrors the USSD item; if delivery is unreliable, trigger the WhatsApp-OTP fallback decision per 04's research flag)
- [ ] Intake interviews completed and logged for all 5 groups; kill-signal thresholds written into `docs/pilot-log.md` before round 1
- [ ] Réunion attendance scheduled for each group's first Meeting Mode round
- [ ] Data-exit promise ready: manual export path (even a CSV from Convex dashboard) so "you can leave with your data" is true on day 1