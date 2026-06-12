# Non-Functional: Security, Regulatory Guardrails, Ops

## A. Regulatory Guardrails — The 10 Commandments of Staying Custody-Free

The app is record-keeping software (Model A). These rules are product law. Each has an enforcement mechanism: **CI** (automated, in `scripts/lint-custody.ts`, modeled on piol-vite's `scripts/lint-design-system.ts`, run pre-commit and in CI) or **REVIEW** (item in `docs/custody-checklist.md`, applied to every PR touching `convex/`, `src/i18n/locales/`, or store-listing/marketing copy; full checklist re-run quarterly and before every store submission).

| # | Commandment | Enforcement |
|---|---|---|
| 1 | **The app never renders a payment API call for member money.** No PSP/MoMo/OM API is ever invoked for a Contribution, Payout, Fine, or AssistanceLevy. | **CI:** import/fetch allowlist. Any occurrence of PSP identifiers (`campay`, `notchpay`, `momo`-API hosts, `orange`-webpay hosts, `flutterwave`, `paystack`) outside the single file `convex/actions/billing.ts` fails the build. |
| 2 | **PaymentRecord parties are always two members.** Every PaymentRecord has `payerMembershipId` and `payeeMembershipId`, both `v.id('memberships')`. The app is never a counterparty. No table field may represent money held by the app. | **REVIEW:** schema checklist item. **CI:** unit test asserts the PaymentRecord validator has both required membership FKs. |
| 3 | **No balance display implying the app holds value.** Computed ledger totals are fine when labeled as records ("Total des cotisations confirmées"); the words implying custody are banned in UI copy: `solde`, `portefeuille`, `wallet`, `balance`, `déposer`, `deposit`, `retirer des fonds`, `withdraw funds`, `recharger`, `top up` — plus the French terms a copywriter will reach for first on this product: `caisse` (the actual njangi word for the group fund; "Caisse du groupe : 200 000 F" reads as app-held pooled funds), `cagnotte`, `fonds disponibles`, `argent disponible`, `encaisser`. | **CI:** copy scan of `src/i18n/locales/{fr,en}.json` against a banned-terms list; false positives suppressed via `scripts/custody-copy-allowlist.json` — allowlist entries only for clearly record-framed usages (e.g. 02's treasurer handover statement, which is labeled ledger arithmetic, never an app-held balance). |
| 4 | **The only PSP integration is collecting the app's own premium subscription fee**, app as merchant via CamPay or Notch Pay. That code lives only in `convex/actions/billing.ts` + its webhook in `convex/http.ts`, and may only write to `subscriptions` (01's table) — never to `paymentRecords`. | **CI:** rule 1's allowlist. **REVIEW:** billing PRs checked that no PaymentRecord write paths are touched. |
| 5 | **USSD is instructions, never execution.** The app may show step-by-step USSD instructions and may deep-link the dialer with the **bare** service code (`tel:*126%23`, `tel:%23150%23`) only — never a composed string containing amount, recipient, or menu path. | **CI:** regex over codebase — any `tel:` URL (link or `Linking.openURL` argument) whose decoded value contains characters beyond the bare service code fails. |
| 6 | **No escrow/hold/release semantics.** PaymentRecord states are exactly `pending | claimed | confirmed | disputed | cancelled`. No state, button, or copy ("release funds", "débloquer") implies the app controls funds. | **CI:** test asserts the state validator union equals exactly those five literals. **REVIEW:** UI checklist. |
| 7 | **Marketing and UI copy never says money moves through the app.** Banned phrases: "envoyez de l'argent via", "payez dans l'application", "paiement sécurisé par [app]", "send money through", "instant transfer", "we process payments". Required framing: "enregistrez", "confirmez", "suivez" / "record", "confirm", "track". | **CI:** same copy scan as rule 3. **REVIEW:** App/Play Store descriptions checked against the list before every submission. |
| 8 | **Loans are recorded, never brokered.** A loan record is freeform: amount + agreed-terms text + the same two-sided acknowledgment. No interest calculator that originates terms, no lender-borrower matching, no repayment "collection". | **REVIEW:** feature checklist. **CI:** copy scan for "prêt instantané", "crédit via l'app", "emprunter dans l'application". |
| 9 | **Never collect MoMo/OM credentials.** The only payment-adjacent datum stored is a member's phone number (which doubles as their MoMo/OM identity). No field or form input named `pin`, `momoPin`, `ussdPin`, or similar may exist. | **CI:** grep over `convex/schema.ts` and `src/components/` for forbidden field names. |
| 10 | **The legal disclaimer is always present**: blocking acknowledgment at sign-up, permanently in Settings → Legal, and as footer on every exported report. | **CI:** Maestro e2e (native) asserts `legal.disclaimerBody` renders in onboarding; export snapshot test asserts footer present. |

### In-app legal disclaimer copy

i18n keys: `legal.disclaimerTitle`, `legal.disclaimerBody` (single source; reused in onboarding, settings, export footer).

**fr (primary):**
> **Avis important**
> Cette application est un logiciel de tenue de registres pour votre njangi. Elle ne détient, ne transfère et ne reçoit jamais l'argent des membres. Toutes les transactions (MTN Mobile Money, Orange Money, espèces) s'effectuent directement entre les membres, en dehors de l'application. Les enregistrements reflètent les déclarations des membres et leurs confirmations mutuelles ; ils ne constituent pas une preuve de transaction émise par un opérateur ou une banque. Cette application n'est ni un établissement de paiement, ni une institution de microfinance, ni un prestataire de services de paiement agréé.

**en:**
> **Important notice**
> This app is record-keeping software for your njangi. It never holds, transfers, or receives members' money. All transactions (MTN Mobile Money, Orange Money, cash) take place directly between members, outside the app. Records reflect members' declarations and mutual confirmations; they are not proof of transaction issued by an operator or a bank. This app is not a payment institution, a microfinance institution, or a licensed payment service provider.

---

## B. Privacy & Security

### PII inventory

| Data | Where | Sensitivity |
|---|---|---|
| Phone numbers (E.164; also the member's MoMo/OM identity) | `users`, feature-phone member records on `memberships` | High — SIM-swap target, spam target |
| Names / display names | `users`, `memberships` | Medium |
| Financial history (PaymentRecords: Contributions, Payouts, Fines, AssistanceLevies, amounts, timestamps, disputes) | `paymentRecords` | High — see small-community note below |
| Group membership graph (who belongs to which njangi) | `memberships` | High — reveals income circles, church/work affiliations |
| Proof screenshots | Convex file storage, `screenshotStorageId` on `paymentRecords` (01's field name) | High — contain MoMo balances, names, numbers of third parties |
| ReliabilityScore | computed/denormalized per `users` + per `memberships` | High |

Never stored: MoMo/OM PINs, ID documents (MVP), precise location.

### Convex access control patterns

Clerk owns identity; Convex owns authorization (piol-vite convention). All resolution via `by_clerk_id` on `identity.subject`. Helpers in `convex/utils/auth.ts`:

- `getCurrentUser(ctx)` — throws `'Not authenticated'` / `'User not found'` / `'Account deactivated'` (verbatim piol-vite).
- `requireMembership(ctx, groupId)` — loads membership via `by_group_and_user` index (01's name); throws `'Not a group member'`. **Every** group-scoped query/mutation calls this first. There is no cross-group read path (true in MVP — cross-group score sharing is L4, see below).
- `requireRole(ctx, groupId, roles)` — e.g. `requireRole(ctx, groupId, ['treasurer'])`; throws `'Insufficient role'`.

Queries return empty defaults (`[]`, `null`) for unauthenticated; mutations throw. Every function declares `args` AND `returns` validators with explicit field picking — no doc spreading, which is itself a privacy control. Phone numbers appear in `returns` shapes only where the role matrix permits, with one deliberate, load-bearing exception: **the round/pay queries include the current payee's phone number for every active member** — the treasurer's MoMo/OM number is what a member pays *to* (03 §C's « Numéro de Marie » + Copier field is impossible without it), and the dispute screen deep-links any party to the payee's WhatsApp. Full member-roster phone projection (member-list screens) is gated to treasurer/president viewers; member-visible roster queries project name/status only.

**Role matrix (Membership roles: president | treasurer | member):**

| Action | member | treasurer | president |
|---|---|---|---|
| See own group's ledger, who-paid-who-when, rotation order, fines | yes | yes | yes |
| Claim own Contribution; confirm own incoming Payout | yes | yes | yes |
| Confirm incoming Contributions; log on behalf of feature-phone members; Meeting Mode | — | yes | **fallback only** — réunions proceed when the trésorier is absent or ill; every president-logged entry is feed-badged « enregistré par le président » (mirror this actor change in 02's transition table row 3) |
| Record the Payout (claim « pot remis ») | — | yes | — |
| Confirm on behalf of a feature-phone (`hasAccount:false`) party — logged as such, feed-labeled « attesté » (05 M8) | — | — (the treasurer is the payout's payer and must never self-confirm) | yes |
| Approve pending joins; add members directly, incl. feature-phone (name + phone) — per 02's invite flow; the treasurer is the champion who onboards 15–30 members (locked decision 5) | — | yes | yes |
| Remove member / mark exited-deceased (mandatory note, per 02's removal flow) | — | — | yes |
| Edit rotation order (before cycle lock), set Fine policy, resolve Disputes | — | — | yes |
| Create AssistanceLevy | — | yes | yes |
| See the current payee's phone number (treasurer's for contributions/fines/assistance; the beneficiary's for a payout owed) + group officers' (treasurer & president) numbers | yes | yes | yes |
| See the full member-roster's phone numbers | — | yes | yes |
| Export reports (premium) | — | yes | yes |

Cross-doc note: 02 transition 4's guard extends from "`hasAccount:false` **payer**" to "`hasAccount:false` **party**" so the payee side (payouts to feature-phone beneficiaries) is covered — without it, every such payout has no one able to confirm and rots into a false public « litige » via the 7-day auto-dispute.

Ledger immutability: `paymentRecords` are append-only; corrections are amendment records referencing the original (`amendsPaymentRecordId` + `amendmentKind`, per 01 §3.4), never edits or deletes. **CI:** no `ctx.db.patch`/`ctx.db.delete` on `paymentRecords` outside the state-machine transition mutation (lint rule).

### Screenshot (proof artifact) storage

- Stored in Convex file storage; `screenshotStorageId: v.optional(v.id('_storage'))` on the PaymentRecord (01's field name).
- URLs resolved only via `ctx.storage.getUrl` inside a query that has already passed `requireMembership` for that record's Group **and** the visibility rule below. No public/permanent URLs ever leave the backend.
- Visibility follows the record's state: while merely `claimed`, the screenshot is visible to payer, payee, and president only — the ledger shows the Confirmation, not the artifact (decision 2: artifacts are advisory). Once `disputed`, it is visible to **all active group members** per 02 §d's full-transparency DECISION, always with the permanent caption « Capture fournie par {name} — ne vaut pas confirmation. »
- **DECISION:** retention is keyed to the **record, not the cycle** (fine/assistance records can be round-less, arrears records are claimable weeks after cycle completion, and disputes never auto-resolve — cycle-keyed purging would destroy the only artifact disputes exist for): purge the image only when the PaymentRecord is terminal (`confirmed`/`cancelled`) AND it has no open dispute AND ≥ 90 days have elapsed since `confirmedAt`/`cancelledAt`/dispute resolution — never while the record is `claimed` or `disputed`. Monthly cron in `convex/crons.ts`; the purge cron itself can ship post-pilot (the pilot ends before any image reaches 90 days). The PaymentRecord row (amount, method, `momoTxnId`, states, timestamps) is kept forever; only the image is purged.

### Why financial-history privacy matters here

Njangi groups overlap with churches, offices, quartiers, and extended family. A visible missed Contribution is not a data point — it is social standing, marriage prospects, and creditworthiness in the actual community the member lives in. A leak doesn't expose "a user"; it exposes a neighbor to debt-shaming and leverage. Therefore:

**ReliabilityScore visibility rules:**

**MVP rule (one line): the score is visible in-group only** — matching 05 M13 (v1 is an in-group ratio) and the launch-checklist counsel fallback. This is what makes "no cross-group read path" literally true.

| Viewer | Sees |
|---|---|
| The member themself | Full breakdown: every record feeding the score, per group |
| Members of the same Group | Full in-group payment history (decision 6 — who-paid-who-when is the product) + the member's in-group on-time rate |
| A *different* Group the member is joining | **Nothing in MVP** — new joiners read « Nouveau membre — pas d'historique partagé », which is neutral, not negative. Cross-group sharing is L4 design-ahead (below). |
| Anyone else / public | Nothing |

**L4 design-ahead (cross-group score portability — 05 demotes it to L4, "impossible before month 2"; nothing in this block is an MVP build item or an enforceable MVP mitigation):**
- Consent flow: on join (or on request from a president), member sees "Partager votre score de fiabilité avec ce groupe ?" — opt-in, revocable; stored in a `scoreShareConsents` table (`membershipId`, `groupId`, `grantedAt`, `revokedAt: v.optional(...)`). No consent row → the new group sees « Nouveau membre — pas d'historique partagé ».
- Shared display is aggregate-only: e.g. "97% à temps, 3 cycles complétés, 2 groupes" — never which groups, amounts, or counterparties. Members never SMS/Clerk-verified are badged « non vérifié » in cross-group displays.
- `hasAccount:false` feature-phone members **default to no-share and cannot be consented by proxy** (a president/treasurer "consenting" for them is exactly the gap to close); consent becomes available only once they sign up via Clerk and link their Membership.
- Schema prerequisite: 01's `reliabilityStats` stores only aggregate per-user counters — no per-group, per-cycle, or group-size dimension. The eligibility gates below (§C) and the "N cycles, N groupes" aggregate **cannot be computed at read time from the MVP schema**; v2 requires per-membership/per-group stat rows (a schema addition to 01) before any of this is implementable.

---

## C. Abuse Cases & Mitigations

| Abuse | Mechanics | Mitigations |
|---|---|---|
| **Fake-confirmation collusion** | Payer + payee (treasurer) collude to confirm Contributions that never happened, inflating ReliabilityScore | **MVP:** the score is in-group only (§B) — there is no portable score to inflate, and the group already sees its own ledger, so colluders are defrauding only people who watch every record. **L4 design-ahead** (when cross-group sharing ships, requires the per-group stat rows noted in §B): score inputs count only confirmed Contributions in Groups with ≥ 8 members and ≥ 1 completed Cycle (**DECISION** on thresholds); group size, cycle completion, and account age weight the score; collusion at real-group scale requires defrauding 15–30 real people who all see the ledger. Post-MVP heuristic (flag, don't block): groups where median claimed→confirmed latency is < 1 minute across a Round. |
| **Treasurer ghost members** | Treasurer invents feature-phone members to pad the group or farm cycle completions | **MVP mechanisms (work from day 1):** phone-number uniqueness across a group's memberships (mutation-enforced via 01's `by_phone`); Clerk sign-up on that number = « vérifié » — definition: *this phone number has authenticated via Clerk OTP* (the free verification path); the group-visible ledger and roster (every member sees every name — phantom members are visible at the réunion); and during the pilot, in-person onboarding — the dev enters members at the réunion (05 §C), so ghosts can't be seeded unseen. **Post-L6/premium hardening:** treasurer-logged entries trigger an SMS receipt to that number — a ghost's SMS reaches a stranger or fails (delivery failures surfaced to president). Note: no feature-phone member can be SMS-verified in MVP (SMS is L6), so « non vérifié » badging applies only in L4 cross-group displays, never as an in-group mark against the whole feature-phone segment. President and treasurer are distinct memberships wherever the group has both. |
| **Reputation farming** | Tiny fake groups run fast cycles to mint portable scores | **MVP:** nothing to farm — no cross-group display exists (§B). **L4 design-ahead:** same thresholds as collusion (min size, completed cycle, account age); cross-group display always includes group count and cycle count, so "100% over 1 tiny group" reads as weak signal. |
| **Screenshot forgery** | Edited MoMo screenshots submitted as proof | Designed out: **truth = payee Confirmation, never the artifact** (decision 2). Screenshots are dispute-resolution context only, never auto-trusted, no OCR, UI copy never calls them "preuve de paiement" (copy-lint list). A forged screenshot still requires the payee to confirm — or the record auto-flags as Disputed. |
| **Account takeover via SIM swap** | Attacker swaps victim's SIM, passes Clerk phone OTP, becomes the member (worst case: the treasurer) | Caveats acknowledged: phone OTP is the weakest factor but the only viable primary factor in this market. Mitigations: changing the phone number on `users`/`memberships` requires an active session + OTP and emits a group-visible activity-feed event (social audit); treasurers/presidents are prompted to add an email second factor in Clerk; Clerk session revocation on credential change; sensitive mutations (rotation-order edits, member removal, phone changes) all produce immutable feed entries the whole Group sees. The attacker can falsify records but cannot do so silently. **RESEARCH FLAG:** verify Clerk SMS OTP delivery rates on MTN and Orange Cameroon in week 1; evaluate Clerk's WhatsApp OTP channel as primary if SMS is unreliable. |
| **Treasurer absconds with cash** | Offline theft — outside app custody by definition | The ledger makes it visible fast — via a **round-level alert, not a PaymentRecord state** (an absconding treasurer simply never *claims* the payout, so the record sits `pending` forever; there is no `pending → disputed` transition anywhere, and none is added). **DECISION:** a cron rule on rounds — any round in `payout` state (or closed with its payout record still `pending`/`claimed`) **7 days** after `graceEndAt` (N = 7, matching 05 Week 2's payout X) triggers a group-visible feed flag + push to all members: « Versement non confirmé — round {n} », repeating weekly until resolved. If the treasurer *did* claim and the beneficiary is silent, 02's existing claimed-payout auto-dispute (`T_AUTO_DISPUTE`, 72h) applies as specced. Cross-doc note: add the corresponding timer row to 02 §(b) so the round lifecycle owns it. The app's job is evidence, not prevention. |
| **Dispute abuse** | Member spam-disputes to harass | Disputes are visible to the whole Group with both sides' records; resolution is a president power; one open Dispute per PaymentRecord; rate-limited per member per Round. |

---

## D. Offline & Connectivity

Cameroon reality: mobile-first, frequent 2G/3G fallback, data is paid per MB.

**Convex realtime on flaky networks (actual client behavior, design around it):**
- The Convex client maintains a WebSocket with automatic reconnect/backoff; on reconnect, query subscriptions re-sync to a consistent snapshot automatically — no app code needed for read freshness.
- Mutations issued while disconnected are queued **in-memory** by the client, sent in order on reconnect, exactly-once per session — but the queue does not survive a killed app.
- Therefore: optimistic UI via `withOptimisticUpdate` on every high-frequency mutation (roll-call ticks, confirm taps), plus a connectivity banner ("Hors ligne — vos saisies seront envoyées") driven by the client connection state.

**Meeting Mode durability (the critical path — 20 cash entries in 2 minutes in a hall with bad signal):**
- **DECISION (adopts 05 Week 2 + Week 4's reviewed decisions):** idempotency = a **client-generated UUID per claim/tap**, stored on the paymentRecord, with a `by_idempotency_key` index; mutations no-op on key collision. A roll-call tick against the round's **pre-created `pending` record** (02/05) is a state *transition* (payee-side claim), naturally idempotent — re-sending it when the record is already in the target state is a no-op on the record id. A partial or second payment (02 edge case 7 — e.g. member sent 5 000 F by MoMo earlier and hands the remaining 5 000 F cash at the réunion) is a **new record with its own UUID, never deduped**. There is deliberately **no** (`roundId`, `payerMembershipId`, `kind`) dedup key: it would make a legitimate second payment indistinguishable from a replay (silently dropping real money records) and would collapse two distinct fines for the same member/round.
- **Offline = Convex's built-in in-memory mutation queue + `withOptimisticUpdate` + a visible « N en attente de synchro » counter in Meeting Mode** (05 Week 4's scope-guard DECISION). Taps are lost if the app is killed before sync — an accepted MVP trade-off; the counter makes the risk visible to the treasurer. NOT a persistent offline-first store — that alone busts the 4–6 week window.
- LATER (post-pilot, only if the killed-app loss bites in practice): a persistent AsyncStorage replay journal, specced as entries of `{tapUUID, targetPendingRecordId, amount}` with replay keyed on the UUID — never on (round, payer, kind).
- Roll-call screen is fully functional offline: amounts prefilled from the Group's fixed Contribution amount, ticks accumulate locally, sync drains when signal returns.

**Payload discipline:** exact `returns` validators with explicit field picking keep query payloads tiny; list queries paginate; images lazy-load. The JS bundle ships inside the native binary (Hermes), so there is no over-the-network JS budget; what costs the member money on 3G is **data over the Convex WebSocket** — the per-screen data budget is owned and CI-enforced by 03 §G (the budget's normative home). Subscription warm-up on navigation intent (mount the target screen's query specs on press-in) replaces the web prewarm pattern so dashboard taps feel instant on 3G.

**Push notifications (expo-notifications):** all member-facing alerts (§C's « Versement non confirmé » round flag, reminder pushes, dispute notices) go through `expo-notifications` and Expo's push service (free, Android + iOS). Expo push tokens are stored on `users.pushTokens` (01's field): registered after sign-in — permission prompt deferred until the first moment a push has obvious value (after joining a group, never at first launch) — refreshed on change, pruned when Expo receipts return `DeviceNotRegistered`. Delivery is best-effort; nothing in the state machine (02's timers, `T_AUTO_CONFIRM`, `T_AUTO_DISPUTE`) ever depends on a push being delivered.

**Feature-phone path in MVP (no SMS — SMS is L6 per 05):**
- The MVP path is the handshake itself: treasurer logs a payee-side claim for the feature-phone member → objection window → **auto-confirm at `T_AUTO_CONFIRM` (48h, anchored at claim time)** — one constant, owned by 02, independent of any SMS delivery. **DECISION:** there is no separate feature-phone finalization timer; if a longer window is ever wanted, change `T_AUTO_CONFIRM` in 02 once — not here. Until L6, the public feed is their receipt (05 Week 4) and the treasurer's voice covers the pilot; objections route through the **president** (whose on-behalf confirmation power is in §B's matrix), not the treasurer whose entry may be wrong.

**SMS fallback architecture (L6 design-ahead — premium phase, NOT an MVP build item; 05 defers all SMS to L6 and 01 §5 deliberately excludes an SMS outbox table — amend 01 §5 to admit `smsOutbox` when L6 ships):**
- Purpose: receipts to feature-phone members (decision 7) and reminder blasts (premium, decision 8). Outbound only — two-way shortcodes are expensive; feature-phone members object via the president. The SMS receipt is a **courtesy notification, never the auto-confirm clock** (`T_AUTO_CONFIRM` runs from the claim whether or not any SMS is sent or delivered). Receipt template per 02, with an actionable phone number and concrete deadline: « Reçu {amount} FCFA pour {groupName}, round {n}. Si erreur, contactez le président au {presidentPhone} avant le {deadlineDate}. »
- Implementation: `convex/actions/sms.ts` exposes one internal action `sendSms({to, body, lang})` behind a provider-adapter interface; messages enqueued in an `smsOutbox` table (status: queued | sent | failed) with cron-driven retry; templates localized from `users.language` with `groups.language` fallback (per 01 — `memberships` has no language field).
- **RESEARCH FLAG — provider selection (research is cheap, verify in week 1; the build stays L6, do not hard-code):**
  - [Orange Developer SMS Cameroon API](https://developer.orange.com/apis/sms-cm) — bundles from ~16 FCFA/SMS ([pricing](https://developer.orange.com/apis/sms-cm/pricing)), but verify whether it terminates on MTN numbers or Orange-only (historically Orange-subscriber-only — disqualifying alone given MTN ~52%).
  - Local aggregators reaching both networks with alphanumeric sender ID: Nexah/SMSVas (Douala), Web2Sms237 — pricing unverified, **ESTIMATE** 12–25 FCFA/SMS.
  - [Africa's Talking](https://africastalking.com/sms/bulksms) lists Cameroon coverage — verify deliverability + sender ID rules.
  - Twilio reaches Cameroon at roughly 35–45 FCFA/SMS (**ESTIMATE**) with sender-ID restrictions — fallback only.
  - **DECISION:** plan at 20 FCFA/SMS; the adapter makes the provider swappable without touching call sites.

---

## E. i18n

Mirror piol-vite exactly, renamed:

- i18next + `initReactI18next`, single `translation` namespace, resources imported as JSON from `src/i18n/locales/{fr,en}.json`.
- Detection: persisted `njangi-language` key in AsyncStorage → default `'fr'` — **no device-locale detection** (no `expo-localization` auto-pick). Cheap Androids in Cameroon (Tecno/Infinix/Itel) are very commonly vendor- or shop-configured in English; device-locale detection would give a francophone low-literacy first-time user her first screen in English, against locked decision 9. The prominent FR/EN toggle on the first onboarding screen (03 B10 already has it) is the only way to switch. `fallbackLng: 'en'`; `escapeValue: false`.
- `src/i18n/config.ts`: `appLocales = ['fr','en'] as const`, `parseAppLocale`, `toIntlLocale` (fr-FR / en-US) — used for date formatting and `formatCurrencyXAF`.
- Key conventions: nested by feature/page, camelCase leaves, namespaces regenerated from the canonical keys actually used in 02/03: `common.*`, `home.*`, `pay.*`, `claim.*`, `confirm.*`, `invite.*` (02's `invite.whatsappMessage`), `group.*`, `cycle.*`, `round.*`, `payout.*`, `fine.*`, `assistance.*`, `dispute.*`, `meeting.*` (03's canonical `meeting.summaryShare` — not `meetingMode.*`), `reliability.*`, `profile.*`, `reminder.*`, `legal.*`, `billing.*`.
- French is the primary copy; every user-facing string (including SMS templates and toast messages) goes through `t()`; both locale files updated in the same commit. **CI:** key-parity script fails if fr/en key sets diverge (add to `scripts/`, pre-commit alongside the custody lint).
- Canonical French glossary — **03 §F's locked UI term mapping is the single source of truth for UI terms**; this list defers to it: Group = "groupe (njangi)", Contribution = "cotisation", Payout = **"le pot / remise du pot"** (per 03 §F — "versement" is acceptable only inside neutral sentences such as SMS receipt copy, never as the UI term), Round = "tour", Cycle = "cycle", Fine = "amende", AssistanceLevy = "assistance", Confirmation = "confirmation", Dispute = "litige", claimed = "déclaré", confirmed = "confirmé", disputed = "contesté", treasurer = "trésorier", president = "président", beneficiary = "bénéficiaire".

---

## F. Observability for a Solo Dev (kill-signal detection)

No third-party analytics needed at pilot scale. One `events` table + on-demand admin queries (EAS Insights comes free with the Expo setup as a coarse cross-check on opens/devices; the `events` table stays the source of truth). **05 §C is the single source of truth for the gated metrics, their thresholds, and the PERSEVERE/PIVOT/KILL decision rules** — this section specs only the implementation layer that feeds it.

**Event capture:** a `logEvent` helper called inside existing mutations/queries (never a separate client round-trip):

```
events: defineTable({
  name: v.string(),            // see catalog below
  userId: v.optional(v.id('users')),
  groupId: v.optional(v.id('groups')),
  props: v.optional(v.any()),  // accepted tracked debt, MVP only
  createdAt: v.number(),
})
  .index('by_group_created', ['groupId', 'createdAt'])
  .index('by_name_created', ['name', 'createdAt'])
```

Event catalog (minimum): `app_opened` (fired on cold start **and** on AppState background→active foreground transitions), `meeting_mode_opened`, `meeting_mode_entry_logged`, `contribution_claimed`, `contribution_confirmed`, `payout_recorded`, `payout_confirmed`, `dispute_opened`, `round_summary_shared_whatsapp`; at L6 add `reminder_sms_sent`, `sms_delivery_failed`.

**Metrics (computed on demand by the `/admin/pilot` queries — exactly 05 §C's four gated metrics; thresholds and decision rules: see 05 §C, not duplicated here):**

| Gated metric (per 05 §C) | Implementation definition |
|---|---|
| Entry rate ("treasurers won't do data entry") | % of the round's pre-created `pending` contribution records reaching `claimed` **or** `confirmed` within 48h of the due/réunion date, **regardless of which side logged** — in MoMo-heavy and diaspora-member groups, members self-claim and the treasurer merely confirms; counting only treasurer-logged entries would kill a healthy group. Separate diagnostic column (recorded, not gated): treasurer-logged vs member-self-logged share, so "treasurers won't do data entry" stays observable in cash-réunion groups. |
| Member open rate | % of smartphone members with ≥ 1 `app_opened` per week (feature-phone members excluded from denominator). |
| Ledger reflects reality | % of confirmed records later disputed or cancelled. |
| Reversion | Groups still logging every round in-app, per round and after 1 full Cycle. |

Secondary signals (record, don't gate on — per 05 §C): Meeting Mode time-per-entry; % of MoMo claims with txn ID attached; median claim→confirm latency; WhatsApp summary share rate per round.

**Surfacing:** `/admin/pilot` screen in the app (05's name) gated by an allowlist of Clerk user IDs (`ADMIN_CLERK_IDS` env var) — one Convex query per gated metric, one plain table per group, plus a gone-dark list. Keep it ugly (05 Week 5 budgets half a day); at 5 pilot groups, opening it twice a week **is** the protocol. A weekly metrics cron + `groupMetricsWeekly` table + Resend digest email is optional post-pilot polish, not pilot scope. Error tracking: **DECISION:** Sentry free tier via `@sentry/react-native` (Expo-supported); Convex dashboard logs for function errors (check during pilot as a daily habit, it's 5 groups).

---

## G. Cost Model at 100 Groups (all figures ESTIMATES — marked)

Assumptions: 100 Groups × ~20 members = 2,000 members; ~1,200 smartphone MAU (rest feature-phone); monthly Rounds dominant; 50 premium Groups. FX: 1 USD ≈ 600 FCFA (**ESTIMATE**; XAF is EUR-pegged at 655.957, USD rate floats).

| Item | Plan / basis | Est. monthly FCFA |
|---|---|---|
| Convex | Free tier (1M function calls, 0.5GB) almost certainly sufficient: ~1,200 MAU × ~300 calls/mo ≈ 360k calls. Budget [Pro at $25/dev/mo](https://www.convex.dev/pricing) for headroom | 0 – 15,000 |
| Clerk | Free ≤ 10k MAU → plan fee 0. SMS OTP pass-through to Cameroon: **RESEARCH FLAG** on per-message rate, est. 30–90 FCFA/OTP × ~500 OTPs/mo (long-lived sessions minimize re-auth) | 15,000 – 45,000 |
| Reminder/receipt SMS (aggregator; ships at L6) | Premium Groups only: 50 × 20 members × ~3 SMS/mo = 3,000 SMS × 20 FCFA (**ESTIMATE**, see §D provider flag) | ~60,000 |
| PSP fees on premium collection | CamPay/Notch Pay merchant fees, **RESEARCH FLAG** est. 2–3.5% of 50 × 2,000 FCFA = 100,000 FCFA collected | 2,000 – 3,500 |
| App distribution (EAS + stores) | EAS free tier (limited builds/mo, low queue priority) is sufficient at pilot release cadence — paid EAS plan only if build volume ever demands it. Apple Developer Program $99/yr ≈ 5,000 FCFA/mo amortized; Google Play Console $25 one-time (~15,000 FCFA, excluded from the monthly column). Convex hosts all backend; no web hosting | ~5,000 |
| Sentry | Free tier (the only third-party telemetry, per §F) | 0 |
| Domain | ~$20/yr amortized | ~1,500 |
| **Total** | | **~85,000 – 130,000 FCFA/mo** (+ ~15,000 FCFA one-time Play fee) |

Read against monetization (decision 8): 50 premium Groups × 2,000 FCFA = 100,000 FCFA/mo revenue → roughly break-even at 100 Groups. Two structural conclusions: (1) **SMS is the dominant cost and must stay strictly premium-gated** — free-tier reminders are push-only (Expo's push service costs nothing); (2) infrastructure (Convex/Clerk/EAS builds) is nearly free at this scale, so the unit economics live or die on SMS volume per Group and the Clerk OTP rate for Cameroon — both flagged for week-1 verification.