# Spec Review Findings — 2026-06-11

Full adversarial review: 5 docs x 2 lenses (njangi-culture+regulatory, solo-dev-scope+correctness) + cross-doc consistency. 201 issues found; all blockers and majors applied in the revised docs; minors applied where cheap.

## 01-domain-model (56 issues)

### [BLOCKER] §3.2 'normative' PaymentRecord state machine contradicts 02's machine — the one 05's fixes were already aligned to (per 00 review-status not

**Issue:** §3.2 'normative' PaymentRecord state machine contradicts 02's machine — the one 05's fixes were already aligned to (per 00 review-status note). 01: Meeting Mode is a direct pending→confirmed shortcut with a payerAcknowledgedAt counter-ack and 'the payer retains the right to open a dispute during the confirmation window' — yet 01 also declares confirmed terminal ('no transitions out, ever'), so that dispute right is unimplementable (the only escape is an amendment, which needs BOTH parties' confirmation — deadlock against a bad-faith treasurer). 02 instead specifies payee-side pending→claimed with T_AUTO_CONFIRM 48h on payer silence, payer-side-only T_AUTO_DISPUTE 72h, escalating T_CONFIRM_REMIND timers, and president on-behalf confirms for hasAccount:false payers. Worse, 01's auto-dispute cron (by_state_and_claimed_at note) walks ALL claimed records using per-group confirmationWindowDays — as written it would auto-dispute every Meeting Mode entry whose payer stays silent, i.e. every feature-phone member every round, the exact outcome §3.2 itself calls 'unacceptable'. The core primitive of the product is specified two incompatible ways.

**Fix applied:** Rewrite §3.2 and the cron note to match 02: payee-side claims (claimedBySide/initiatedBySide='payee') auto-confirm on payer silence at T_AUTO_CONFIRM; payer-side claims auto-dispute at T_AUTO_DISPUTE after reminder pushes; counterparty-only manual confirm plus president on-behalf for feature-phone payers. Drop or repurpose payerAcknowledgedAt (02 models the counter-ack as the claimed stage itself). Reconcile per-group confirmationWindowDays vs 02's fixed 72h/48h timers in one place — one of the two docs must own the number. Delete the 'payer retains the right to dispute' sentence or add an explicit confirmed→disputed transition for the counter-ack window; as written it contradicts the terminal rule.

### [BLOCKER] Rotation is locked forever: I-4 says rotationOrder is 'never written after status=active' and a DECISION explicitly rejects per-slot metadat

**Issue:** Rotation is locked forever: I-4 says rotationOrder is 'never written after status=active' and a DECISION explicitly rejects per-slot metadata ('swaps, substitutions'). But 02 §Cycle requires post-lock changes via immutable OrderChange records — swapping two future beneficiaries ('begging the turn', which 02 itself calls the common practice) and removing exited/deceased/defaulting members' future rounds with remaining rounds shifting earlier. Mid-cycle swaps for urgent need (deuil, illness) and deaths/exits are routine njangi reality and near-certain during a full pilot rotation; under 01's schema the group hits a wall and reverts to the notebook (a named kill signal). 02's documented behavior is unimplementable on 01's data model.

**Fix applied:** Add an orderChanges table (cycleId, kind: 'swap'|'remove', affected membershipIds / round indexes, presidentMembershipId, mandatory note — immutable, feed-visible) and restate I-4: rotationOrder and future rounds' beneficiaryMembershipId are mutable only for not-yet-open rounds, only via an orderChanges record written in the same mutation, full audit trail. 'Locked and public' stays true in the way njangis mean it: changes are presidential, noted, and visible to all — not impossible.

### [BLOCKER] Core PaymentRecord state machine (§3.2) contradicts 02/05 and itself. 01 uses a Meeting-Mode `pending → confirmed` shortcut with `confirmed`

**Issue:** Core PaymentRecord state machine (§3.2) contradicts 02/05 and itself. 01 uses a Meeting-Mode `pending → confirmed` shortcut with `confirmed` terminal forever, yet promises 'the payer retains the right to open a dispute during the confirmation window' — unhonorable: `disputed` is only reachable from `claimed`, and dispute resolution `resolved_cancelled → cancelled` is a forbidden exit from `confirmed`. 02 (the doc 05's applied review fixes were aligned to) instead uses payee-side `pending → claimed` with `T_AUTO_CONFIRM` (48h silent-objection auto-confirm) and a `confirmed → cancelled` president-override exit; 05 M4/M9 codify exactly that. Building the schema/machine from 01 as written breaks the core handshake primitive (locked decision 2) for the killer Meeting Mode feature.

**Fix applied:** Replace §3.2 with 02 §c's machine: payee-side claims enter `claimed` (initiatedBySide='payee') and auto-confirm at T_AUTO_CONFIRM on payer silence; payer-side claims auto-dispute at T_AUTO_DISPUTE; add the `confirmed → cancelled` president-override transition (or explicitly reconcile with 02 if confirmed stays terminal). Drop the `payerAcknowledgedAt` counter-ack-on-confirmed design — the objection window IS the claimed period.

### [BLOCKER] Immutable rotationOrder makes mid-cycle exit/death/default-removal unimplementable. I-4 ('rotationOrder never written after status=active', 

**Issue:** Immutable rotationOrder makes mid-cycle exit/death/default-removal unimplementable. I-4 ('rotationOrder never written after status=active', rounds.length === rotationOrder.length, beneficiary = rotationOrder[index-1]) plus the explicit DECISION rejecting per-slot metadata, plus roundStatus having no `skipped`/`cancelled`, plus `rounds` on the no-delete list, jointly forbid everything 02 documents as the handling: removing an exited/deceased/defaulting member's future round, shifting remaining rounds, swapping future beneficiaries ('begging the turn'), and skipping a round. The pilot will certainly hit a member exit or default-removal within one cycle; 01's schema has no legal way to record it.

**Fix applied:** Relax I-4 to 'rotationOrder/rounds changed only via system-generated, immutable OrderChange records (president-only, mandatory note)'; add an `orderChanges` table per 02 §rotation-order; add `skipped` to roundStatusValidator; allow scheduledDate shifts on not-yet-closed rounds (skip/pause); restate I-4 as 'rounds and order match the OrderChange-adjusted rotation'.

### [BLOCKER] 01's schema cannot implement 02's lifecycles, and Week 1 of the build plan is 'write the schema'. Mismatches: groupStatus is active|archived

**Issue:** 01's schema cannot implement 02's lifecycles, and Week 1 of the build plan is 'write the schema'. Mismatches: groupStatus is active|archived (02 needs setup|active|paused|between_cycles|archived); roundStatus is upcoming|open|closed (02 needs scheduled|open|grace|closed|payout|completed + a terminal removal state); membershipStatus is invited|active|left|removed (02 uses pending_approval|active|rejected|exited|deceased). Tables/fields 02 depends on are absent: the universal `transitions` log (01 §5 explicitly rejects an audit table), `presidentOverrides`, `fineProposals`, `isArrears`, `joinedMidCycle`, GRACE_DAYS per-group setting, and the idempotency key + by_idempotency_key index that 05 Week 2 decided (needed for offline tap replay). Naming drift: 02 `claimedBySide` vs 01 `initiatedBySide`; 02 6-char invite codes vs 01 '≥10 chars'. Flow drift: 01 §3.2 models Meeting Mode as pending→confirmed direct (and lets the payer 'open a dispute' on a record 01 itself declares has no transitions out), while 02 — and the already-reviewed 05 — use pending→claimed(payee-side)→auto-confirm at T_AUTO_CONFIRM; 01's I-1 gates round `closed` on payout confirmed, while 02 closes at graceEndAt with payout afterwards; 01 lets 'treasurer or president' resolve disputes, 02 §d is president-only.

**Fix applied:** Regenerate 01's validators, tables, and invariants from 02 as the source of truth (05 was already aligned to 02's machine per 00's review status). Delete 01's pending→confirmed Meeting Mode shortcut, adopt 02's payee-side-claim + T_AUTO_CONFIRM, split round 'closed' from 'completed', adopt 02's membership states, add the transitions log + isArrears + joinedMidCycle + idempotencyKey fields, and pick one invite-code length. Do this before any Week 1 code.

### [BLOCKER] Round state set contradicts 02. 01 `roundStatusValidator` = `upcoming | open | closed`; 02 §b defines `scheduled | open | grace | closed | p

**Issue:** Round state set contradicts 02. 01 `roundStatusValidator` = `upcoming | open | closed`; 02 §b defines `scheduled | open | grace | closed | payout | completed | skipped`. 01 rounds also lack the fields 02 computes at cycle lock (`scheduledOpenAt`, `dueAt`, `graceEndAt` — 01 has only `scheduledDate`), the per-member frozen obligation status (`on_time|late|partial|unpaid|disputed`, 02 §b closing rule 1), and the `isArrears` flag on paymentRecords (02 §b closing rule 2). 01's `closed` comment ('payout confirmed + treasurer closed') even inverts 02's ordering, where `closed` precedes payout confirmation.

**Fix applied:** In 01: replace the validator with 02's seven states; replace `scheduledDate` with `scheduledOpenAt`/`dueAt`/`graceEndAt` (ms epoch); add a frozen `obligationStatuses` structure (or per-record snapshot) for `on_time|late|partial|unpaid|disputed`; add `isArrears: v.optional(v.boolean())` to paymentRecords plus the obligation-split rule for partials (02 §e7); update the `by_status_and_scheduled_date` index and §3.1 cron notes to key on `dueAt`/`graceEndAt`.

### [BLOCKER] Meeting Mode tick state contradicts 02 (and reviewed 05). 01 §3.2 has `pending → confirmed` directly for payee-logged cash, with `payerAckno

**Issue:** Meeting Mode tick state contradicts 02 (and reviewed 05). 01 §3.2 has `pending → confirmed` directly for payee-logged cash, with `payerAcknowledgedAt` as a non-state-changing counter-ack; 02 §c transition 3 makes the tick a payee-side `pending → claimed` that auto-confirms at `T_AUTO_CONFIRM` (48h) on payer silence. 05 (M6 'batch-creates claimed', M9, Week 4) agrees with 02 — 00's review record explicitly lists 'payee-side auto-confirm' as an applied 05 fix. 01 also has no auto-confirm transition at all, and its auto-dispute cron (§3.1 `by_state_and_claimed_at`) flips ALL overdue claimed records, where 02 restricts auto-dispute to payer-side claims only.

**Fix applied:** In 01 §3.2: change the payee-side row to `pending → claimed` (`initiatedBySide='payee'` — also reconcile the field name with 02's `claimedBySide`); add `claimed → confirmed (auto)` at `T_AUTO_CONFIRM`, guarded `initiatedBySide='payee'`; guard auto-dispute with `initiatedBySide='payer'`; delete the `pending → confirmed` shortcut DECISION and repurpose `payerAcknowledgedAt` (payer's 'C'est exact' tap becomes the real `claimed → confirmed` confirm).

### [BLOCKER] Confirmed-record correction mechanism forks three ways. 02 transition 12 allows `confirmed → cancelled` via president override with an immut

**Issue:** Confirmed-record correction mechanism forks three ways. 02 transition 12 allows `confirmed → cancelled` via president override with an immutable `presidentOverrides` row; 01 §3.2 declares `confirmed` 'Terminal. No transitions out, ever' and §3.4 handles corrections via two-sided amendment records (`amendsPaymentRecordId`); 04 §B uses yet another field name (`reversesId`); 05 Week 2 says cancel 'never from confirmed'. These cannot all be implemented.

**Fix applied:** Pick ONE mechanism. Per the 02-is-source-of-truth rule: add the `confirmed → cancelled` president-override transition (mandatory note ≥10 chars) and a `presidentOverrides` table to 01, demote §3.4 amendment records to post-MVP, and update 05 Week 2 ('never from confirmed' → 'only via president override') and 04 §B (`reversesId` wording) to match. If the team instead prefers 01's strictly-append-only amendment model (arguably stronger for the immutability wedge), then 02 transition 12 and its mermaid edge must be rewritten as 'president-overridden via reversal record; original stays confirmed but excluded from balances' — but one doc must win before Week 2 code.

### [MAJOR] The reliability score is blind to non-payment — the cardinal njangi sin. §4: 'never-confirmed records contribute nothing'; inputs are onTime

**Issue:** The reliability score is blind to non-payment — the cardinal njangi sin. §4: 'never-confirmed records contribute nothing'; inputs are onTime/late/disputed only. 02 defines score events round_unpaid and post_payout_default (the 'nightmare case the ledger exists for', 'the heaviest penalty — weighted above ordinary unpaid rounds'), but reliabilityStats has no counters for them and the formula has no term: a member who takes the pot and stops contributing keeps a perfect portable score. The portable score is the locked trust wedge (decision 6); it currently cannot see its central fraud case, and the two docs contradict on the flagship feature's inputs.

**Fix applied:** Add unpaidCount and postPayoutDefaultCount to reliabilityStats, incremented at round close per 02's events (unpaid obligation at close; post-payout default flagged per 02 §219), weighted in the formula at least as heavily as disputedCount (post_payout_default heavier). The replay migration can derive both from closed rounds minus confirmed contributions, so counters stay a rebuildable cache.

### [MAJOR] roundStatusValidator (upcoming/open/closed, with closed commented 'payout confirmed + treasurer closed') cannot represent 02's round lifecyc

**Issue:** roundStatusValidator (upcoming/open/closed, with closed commented 'payout confirmed + treasurer closed') cannot represent 02's round lifecycle: open → closed → payout → completed, where contribution collection closes independently of the payout handshake and the round waits in 'payout' until the beneficiary confirms. Also, 01's pre-creation DECISION creates only contribution records at round open, while 02 §103 pre-creates the payout record too (amount = members × contribution, treasurer-editable at claim time).

**Fix applied:** Align roundStatusValidator with 02 (add 'payout' and 'completed' literals; redefine 'closed' as contributions-closed) and extend the pre-creation note to include the single pending payout record created at open. Update I-1's closing condition to match (round completes, not closes, on confirmed payout).

### [MAJOR] membershipStatusValidator (invited/active/left/removed) is missing the states and flags 02 depends on: pending_approval (join-link approvals

**Issue:** membershipStatusValidator (invited/active/left/removed) is missing the states and flags 02 depends on: pending_approval (join-link approvals), exited, deceased (drives 02's two payout-handling branches for a deceased beneficiary), joinedMidCycle:true (mid-cycle joins parked for next cycle), and the 'defaulting' badge after 2 unpaid rounds. Death of a member is routine njangi reality — the same spec ships bereavement levies — yet the schema cannot record it. 02 also uses hasAccount:false where 01 uses absent userId; same concept, two vocabularies.

**Fix applied:** Align the union with 02: pending_approval / active / exited / deceased (decide whether 'removed' folds into exited-with-note as 02 implies). Add joinedMidCycle: v.optional(v.boolean()). State explicitly that hasAccount:false ≡ userId absent so both docs share one term. Define where the 'defaulting' badge lives (derived from open arrears vs stored flag).

### [MAJOR] 02's default/fine mechanics have no schema support. 02 §§212–248: unpaid obligations at round close become 'arrears records' that 'stay open

**Issue:** 02's default/fine mechanics have no schema support. 02 §§212–248: unpaid obligations at round close become 'arrears records' that 'stay open' and are 'materialized immediately' for all remaining rounds on post-payout default, with repayments 'logged as ordinary contribution records against the arrears'; the fine flow is system-propose → treasurer-confirm, and the resulting paymentRecord links a fineProposalId. 01 has fines as manual-only (no proposal concept, no fineProposalId field) and never defines what happens to unpaid pending contribution records when a round closes — the arrears concept simply doesn't exist in the data model.

**Fix applied:** Define arrears in 01: simplest is that unpaid pending contribution records survive round close as open obligations (state the rule explicitly, plus an index/query path for 'what does {member} owe across rounds'); otherwise add an obligations/arrears table. Add fine-proposal support: a 'proposed' literal in fineStatus (proposed → owed on treasurer confirm) or a proposals table, and the fineProposalId link 02 references. Note this preserves 01's good no-auto-fine principle — the system proposes, a human confirms.

### [MAJOR] I-5 hardcodes every contribution's payee as the active treasurer. Many real njangis hand contributions directly to the beneficiary at the ré

**Issue:** I-5 hardcodes every contribution's payee as the active treasurer. Many real njangis hand contributions directly to the beneficiary at the réunion, and MoMo-based groups rationally send straight to the beneficiary's wallet because the member→treasurer→beneficiary double hop costs two sets of MoMo transfer/withdrawal fees — real money in this market. Under I-5 the ledger cannot record that truthfully: either a fictional treasurer hop is logged (the payee-confirmation 'truth' lands on someone who never received the money, corrupting dispute resolution) or the group stops logging. This is a Western collected-pot assumption imposed on a practice that is frequently direct-handover.

**Fix applied:** Add a per-group (or per-cycle, snapshotted) collection mode: 'via_treasurer' | 'direct_to_beneficiary'. I-5 validates contribution payee against the mode (direct mode ⇒ payee must equal round.beneficiaryMembershipId, and the payout record is omitted or auto-satisfied). Meeting Mode cash roll-call is unchanged for via_treasurer groups.

### [MAJOR] I-4 requires rotationOrder to contain 'each active membership exactly once' — this forbids multiple hands ('deux mains' / multiple names: on

**Issue:** I-4 requires rotationOrder to contain 'each active membership exactly once' — this forbids multiple hands ('deux mains' / multiple names: one person contributes ×k per round and receives k turns per cycle), a widespread Cameroonian njangi practice. Nothing elsewhere in the model (one pending contribution per membership per round, fixed expectedAmountPerMember) accommodates it either, and there is no stated invariant preventing duplicate (group,user) memberships that could have served as a workaround. Groups using multiple hands — common in larger tontines — cannot be onboarded as they actually operate, undermining 'onboard whole existing njangis' (locked decision 5).

**Fix applied:** Allow a membershipId to appear multiple times in rotationOrder (each occurrence = one hand), pre-create one pending contribution record per hand per round, and make the (group,user) one-active-membership uniqueness rule explicit. If deliberately deferred instead, record it as a DECISION in §5 and have 05's pilot-recruitment protocol screen out multi-hand groups so the pilot doesn't fail on it silently.

### [MAJOR] disputedCount is mis-attributed for payee-initiated records. §4 increments the payer's disputedCount whenever a contribution dispute resolve

**Issue:** disputedCount is mis-attributed for payee-initiated records. §4 increments the payer's disputedCount whenever a contribution dispute resolves resolved_cancelled, glossed as 'the member claimed a payment that the group adjudicated did not happen.' But on Meeting Mode / payee-initiated records the payer never claimed anything — the treasurer asserted the entry. If a member objects to a treasurer's erroneous (or fraudulent) cash tick and the group cancels it, the innocent member's portable score absorbs 'the single worst trust signal' for the treasurer's mistake. In a culture where the treasurer holds authority, this systematically punishes members for officer errors.

**Fix applied:** Condition the increment on initiatedBySide='payer' (the member personally asserted a payment that was adjudicated false). Payee-initiated records resolved_cancelled are neutral for the payer; consider a separate treasurer-side error counter post-MVP.

### [MAJOR] Custody-creep vector in the domain vocabulary: §3.4 and §5 name the ledger fold 'the single function every balance, export, and round summar

**Issue:** Custody-creep vector in the domain vocabulary: §3.4 and §5 name the ledger fold 'the single function every balance, export, and round summary calls' and 'Balances are a fold over confirmed paymentRecords' — with no constraint that displayed totals must be framed as cash held by the treasurer outside the app. The overview red line is explicit: 'No balances implying the app holds value.' 03 currently has no « solde » copy and 02 gets the framing right ('handover statement — ledger cash-on-hand' as the treasurer's physical cash), but 01 is the doc that defines the domain language every screen will call — an unqualified « Solde du groupe : 450 000 FCFA » screenshot is exactly what May-2025 CEMAC 04/18 enforcement reads as the app presenting held value.

**Fix applied:** Add a normative note to §3.4/§5: ledger.ts outputs are attributed third-party amounts only — name the exports cashWithTreasurer / confirmedContributionTotal etc., never 'balance' — and any UI rendering of them must attribute custody (« Espèces chez le trésorier », « Total confirmé ce round »), never an unqualified « solde »/'balance'. Cross-reference the rule into 03's copy guide so it binds future screens.

### [MAJOR] No way to move a réunion. Rounds' scheduledDate is generated in bulk at cycle activation and nothing in 01 or 02 permits editing it, yet due

**Issue:** No way to move a réunion. Rounds' scheduledDate is generated in bulk at cycle activation and nothing in 01 or 02 permits editing it, yet dueCutoff, on-time/late reliability classification, late-fine suggestions, and reminder crons all hang off it. Postponed meetings (deuil, holidays, travel) are certain during a pilot rotation; with a stale date, every member of a cash-at-réunion group gets misclassified late and mis-fined. 02's group-level 'paused' state is too blunt for one shifted meeting and its unpause date-recompute is unspecified. Secondary: scheduleValidator's weekly/biweekly/monthly cannot express 'first Sunday of the month' or the traditional 8-day market-week cadence some groups use.

**Fix applied:** State in the rounds field notes that treasurer/president may edit scheduledDate of upcoming/open rounds (audited via a feed entry; dueCutoff and reminders recompute), and add the corresponding transition note to 02. Record day-of-meeting patterns (first-Sunday, every-N-days) as an explicit post-MVP DECISION in §5.

### [MAJOR] Two incompatible correction mechanisms across docs, and 01's is deadlock-prone. 01 §3.4 specifies two-sided-handshake amendment records (`am

**Issue:** Two incompatible correction mechanisms across docs, and 01's is deadlock-prone. 01 §3.4 specifies two-sided-handshake amendment records (`amendsPaymentRecordId`, reversal/correction kinds, ledger fold in convex/lib/ledger.ts); 02 §d and 05 M4/M9 specify a president override (`presidentOverrides` table, direct `confirmed → cancelled`, mandatory note). 01's amendments leave the amendment record's shape undefined (kind? payer/payee orientation of a reversal? roundId? which side's confirmation is the truth bit?) and require the counterparty's agreement — a Meeting-Mode fat-finger against an unresponsive or feature-phone member grinds through a multi-day auto-dispute just to fix a typo. Separately, 01 lets the treasurer resolve disputes ('treasurer or president, mutation-enforced') — the treasurer is payee on most disputed records, i.e. judge in their own case; 02 deliberately makes resolution president-only with a visible badge when the president is a party.

**Fix applied:** Adopt 02's model: add `presidentOverrides` table; cut §3.4's correction-kind amendments and the ledger fold (a real solo-dev scope win — strike-through UI reads the override row instead); make dispute resolution president-only per 02 §d transition 11. If amendments survive for any case, fully specify the amendment record's kind/payer/payee/roundId and confirmation actor.

### [MAJOR] membershipStatusValidator (`invited|active|left|removed`) cannot represent 02's membership lifecycle: no `pending_approval`/`rejected` (02's

**Issue:** membershipStatusValidator (`invited|active|left|removed`) cannot represent 02's membership lifecycle: no `pending_approval`/`rejected` (02's deliberate closed-trust-circle decision — without it, anyone with the WhatsApp invite link auto-admits into a money group and sees its full ledger), no `deceased` (02 edge case 2 gives it distinct payout handling), no `joinedMidCycle` flag (02 edge case 4: mid-cycle joins accepted but deferred to next cycle). Also 05 M2 names a `hasAccount` flag where 01 uses absent `userId` (equivalent — pick one name).

**Fix applied:** Align the validator with 02: `pending_approval | active | rejected | exited | deceased` (or a superset mapping left/removed → exited with a reason field); add `joinedMidCycle: v.optional(v.boolean())`; note that direct treasurer-add (feature-phone/known member) skips approval per 02. Standardize on one feature-phone marker (userId absent) and say so where 05 references hasAccount.

### [MAJOR] Group and round status validators can't represent 02's lifecycles, and the definitions contradict. groupStatus is `active|archived` only — `

**Issue:** Group and round status validators can't represent 02's lifecycles, and the definitions contradict. groupStatus is `active|archived` only — `paused` (02 §a: timers frozen, dates shift on resume) has no home anywhere in 01's schema. roundStatus `upcoming|open|closed` lacks `grace`, `payout`, `completed`, `skipped`; and 01 defines `closed` as 'payout confirmed + treasurer closed' while 02/05 M8 define close as system-driven at graceEndAt with the payout possibly still pending and shortfalls allowed. Consequence bug: the reminder cron on `by_status_and_scheduled_date` has no group/cycle-status guard, so rounds of a cancelled cycle or paused/archived group sit `upcoming` forever and keep firing ghost reminders — trust-destroying in pilot.

**Fix applied:** Adopt 02's states (group: + paused; round: scheduled/open/grace/closed/payout/completed/skipped, or a documented minimal superset) and 02's close semantics (force-close at graceEndAt, payout handshake parallel from open, completion not gated on arrears/disputes). Make skip/pause/cycle-cancel transition affected rounds out of cron-visible states, or add a status guard to the cron.

### [MAJOR] Arrears and frozen per-member obligation status are unsupported by the schema. 02's closing rules freeze each member's obligation status (`o

**Issue:** Arrears and frozen per-member obligation status are unsupported by the schema. 02's closing rules freeze each member's obligation status (`on_time|late|partial|unpaid|disputed`) on the round and flag straggler pending records `isArrears: true` (claimable indefinitely); 05 M8 (close with shortfall, arrears stay open) and M13 (score measured per 02 §obligation-status) depend on both. 01 has neither field, never says what happens to pending records at round close, and its ledger-final rule ('confirmed AND round closed') silently makes an arrears record confirmed weeks after close instantly ledger-final with no stated semantics.

**Fix applied:** Add `isArrears: v.optional(v.boolean())` to paymentRecords and per-member obligation status storage (a small `roundObligations` table or a frozen map on rounds, written once at close); define ledger-final for post-close confirmations (e.g. confirmed + N days, matching the round-less rule already in §3.2).

### [MAJOR] Partial and double payments are unrepresentable as written. Pre-creation makes exactly one fixed-amount pending record per member; 01 never 

**Issue:** Partial and double payments are unrepresentable as written. Pre-creation makes exactly one fixed-amount pending record per member; 01 never says the claim amount is editable, never allows multiple contribution records per (member, round), and §5's 'variable per-member contribution amounts excluded' reads as forbidding it. 02 edge cases 6–7 and 05 Week 4 make the opposite explicit: amounts editable at claim ('people send what they have'), multiple records per obligation normal, satisfaction = sum of confirmed ≥ fixed amount, system splits the shortfall into a new pending record, overpaid gets a badge with no carry-forward credit. A member handing the treasurer 5,000 of 10,000 XAF at the réunion — a certain pilot event — cannot be recorded truthfully under 01.

**Fix applied:** Document in §3.1 paymentRecords: claim amount editable (prefilled with expected), multiple records per (member, round) legal, obligation satisfied by confirmed-sum ≥ expected, shortfall split + overpaid badge per 02 §e6–7; clarify §5's exclusion means the *expected* amount is fixed, not actual record amounts.

### [MAJOR] Reliability score misses the worst behaviors and double-counts partials. §4 states 'never-confirmed records contribute nothing' — so a pure 

**Issue:** Reliability score misses the worst behaviors and double-counts partials. §4 states 'never-confirmed records contribute nothing' — so a pure defaulter takes zero hit: 3 on-time payments + 7 unpaid rounds renders 100 « Excellent », inverting the product's core trust promise (locked decision 6). 02 §d/§e define exactly the missing events: `round_unpaid`, `post_payout_default` (named the heaviest penalty), `fine_unpaid` — none have counters in reliabilityStats. Also per-record counting breaks under multi-record partial satisfaction (three partial confirms = three on-time increments vs one for a lump payer), whereas 02 scores per round-obligation.

**Fix applied:** Count per round-obligation at round close (one on_time/late/unpaid event per member per round, from the frozen obligation status), not per record; add `unpaidCount` and `postPayoutDefaultCount` counters (weighted heaviest) and fold them into the formula; keep `disputedCount` for resolved-against false claims per 02's false_claim events.

### [MAJOR] No idempotency key in the schema despite 05 Week 2's applied review fix: 'client-generated UUID per claim/tap stored on paymentRecords with 

**Issue:** No idempotency key in the schema despite 05 Week 2's applied review fix: 'client-generated UUID per claim/tap stored on paymentRecords with by_idempotency_key index; mutations no-op on key collision.' Offline Meeting Mode (Convex in-memory queue + optimistic UI) replaying taps will duplicate every ad-hoc insert — extra/partial contributions, fine settlements, payout claims. Related contradiction: §3.4 layer 1 says mutations touching a confirmed record must *throw*, while 05 Week 2 (and Convex serialization handling of concurrent confirms) requires re-tapped confirms to be idempotent no-ops returning current state.

**Fix applied:** Add `idempotencyKey: v.optional(v.string())` + `by_idempotency_key` index to paymentRecords; specify that state-transition mutations on pre-created records no-op (not throw) when already in target state, reserving the throw for genuine illegal mutations of confirmed rows.

### [MAJOR] §5 explicitly excludes an audit/events table ('paymentRecords + confirmations + disputes ARE the audit trail'), but 02's opening paragraph m

**Issue:** §5 explicitly excludes an audit/events table ('paymentRecords + confirmations + disputes ARE the audit trail'), but 02's opening paragraph mandates an immutable `transitions` log for every entity transition, and 05 schedules `activityEvents` in the Week 1 schema, writes them on every transition in Week 2, and instruments ALL four pilot kill-signal metrics on them (§C: 'Instrument via Convex activityEvents'). As specified, the /admin/pilot dashboard — a launch-checklist gate before group #1 — cannot be built on 01's schema, and round/cycle/membership transitions (which have no paymentRecord) leave no trace at all.

**Fix applied:** Add one `activityEvents` table (entityTable, entityId, fromState, toState, actorMembershipId|'system', groupId, note) serving triple duty as 02's transitions log, the group feed source, and the pilot metrics source; rewrite §5's audit-log exclusion row to explain why this one table replaces both the index-based feed and a generic audit table.

### [MAJOR] Treasurer replacement mid-round is unhandled. I-2 only says the role swap is atomic; pre-created pending/claimed records keep `payeeMembersh

**Issue:** Treasurer replacement mid-round is unhandled. I-2 only says the role swap is atomic; pre-created pending/claimed records keep `payeeMembershipId` = the demoted treasurer, whom I-5 ('contribution payee must be the group's active treasurer') then renders invalid — new claims fail the invariant check, the old treasurer is the only one who can confirm in-flight records, and the new treasurer's inbox is empty. 02 edge case 5 already solved this (re-point payeeMembershipId of all non-terminal records to the new treasurer; confirmed records keep the historical treasurer; handover cash-on-hand statement) and 05 R2 depends on it; 01 just never absorbed it.

**Fix applied:** Extend I-2: the role-swap mutation also re-points payeeMembershipId on all pending/claimed/disputed contribution/fine/assistance records to the new treasurer in the same transaction (confirmed rows untouched — the ledger says who actually held the cash); note the handover statement as a fold over confirmed records; clarify I-5 is checked against the treasurer at write time.

### [MAJOR] Feature-phone payee cannot confirm, so rounds with a feature-phone beneficiary can never complete cleanly. §3.2 allows treasurer-on-behalf o

**Issue:** Feature-phone payee cannot confirm, so rounds with a feature-phone beneficiary can never complete cleanly. §3.2 allows treasurer-on-behalf only for the *payer* side; `claimed → confirmed` is 'payee only'. A payout claimed by the treasurer to a feature-phone beneficiary (no app, SMS confirmation explicitly marked 'future') sits unconfirmable until the cron auto-disputes it — every such round ends in an auto-dispute, and I-1 blocks round close until the payout is confirmed. 05 M8 already specifies the fix: 'Feature-phone beneficiary: president confirms on their behalf, logged as such, feed-labeled attesté — no deadlock.'

**Fix applied:** Add to §3.2's actor column: for payees with no userId, the president (not the payer/treasurer — keep the parties separate) may confirm on their behalf, with recordedByMembershipId and a confirmation row (channel 'app', on-behalf flag) making the attestation auditable, per 05 M8.

### [MAJOR] 02's reliability score events cannot be represented: §e1/§e3/§f emit round_unpaid, post_payout_default ('the heaviest penalty — weighted abo

**Issue:** 02's reliability score events cannot be represented: §e1/§e3/§f emit round_unpaid, post_payout_default ('the heaviest penalty — weighted above ordinary unpaid rounds'), fine_unpaid, and distinct false_claim_withdrawn vs false_claim_overridden weights, but 01's reliabilityStats has only onTimeCount/lateCount/disputedCount and its formula only counts CONFIRMED contributions — a member who simply never pays (including the §e3 post-payout nightmare case the product exists for) has a score untouched by default. 05 M13's 'on-time ÷ rounds elapsed' does punish unpaid, so the three docs define three incompatible scores.

**Fix applied:** Align 01 to cover 02's events at minimum-viable fidelity: add unpaidRoundCount (incremented when a round closes with frozen status unpaid/partial) and postPayoutDefaultCount counters, put unpaid rounds in the formula denominator, and mark 02's finer-grained event weights (fine_unpaid, withdrawn-vs-overridden distinction) as post-pilot tuning of the pure derive function.

### [MAJOR] Two incompatible correction mechanisms for confirmed records: 02 transition 12 allows president override confirmed→cancelled (with immutable

**Issue:** Two incompatible correction mechanisms for confirmed records: 02 transition 12 allows president override confirmed→cancelled (with immutable override record), while 01 §3.2 declares confirmed 'Terminal. No transitions out, ever' and §3.4 builds an amendment-record system (reversal/correction kinds, two-sided amendment handshake, by_amends index, effective-ledger fold in convex/lib/ledger.ts). 02's edge 6 (duplicate confirmed) depends on override-cancel; 01 forbids it. Building both is wasted solo-dev weeks; building one while the other doc disagrees guarantees drift.

**Fix applied:** Pick 02's president-override (one transition + one immutable note row, already covers duplicates/fat-fingers/write-offs in 02's edge cases) and delete 01 §3.4's amendment machinery from MVP — it is the heavier system and nothing in 02 or 05 needs it. Keep amendsPaymentRecordId as a LATER note if desired. Whichever wins, both docs must say the same thing.

### [MAJOR] 01 encodes a materially different machine than the one 05 builds 'per 02', and 05 Week 1 implements the schema while Week 2 implements 02's 

**Issue:** 01 encodes a materially different machine than the one 05 builds 'per 02', and 05 Week 1 implements the schema while Week 2 implements 02's machine — they don't compose: (a) 01 §3.4 makes Meeting Mode a direct pending→confirmed shortcut with `payerAcknowledgedAt` counter-ack, vs 02/05's payee-side `claimed` + T_AUTO_CONFIRM objection window; (b) 01 says confirmed is 'Terminal. No transitions out, ever' and corrections use amendment records, vs 02's president override confirmed→cancelled; (c) 01's roundStatusValidator has 3 states (upcoming/open/closed) vs 02's scheduled/open/grace/closed/payout/completed + skipped, which Week 2's arrears-at-close logic requires; (d) 01's auto-dispute cron uses per-group `confirmationWindowDays` vs 02's fixed app-wide timers; (e) 01's dispute resolution authority is 'treasurer or president' vs 02's president-only override; (f) 01's paymentRecords has no `idempotencyKey` field or `by_idempotency_key` index, which 05's Week 2 idempotency DECISION requires; (g) 01 explicitly excludes an audit/event table while 05's M7 activity feed and 02's `transitions` log both need one.

**Fix applied:** Reconcile 01 to the 02/05 machine before Week 1 starts (00 already flags 01 as unreviewed): adopt payee-side claimed + T_AUTO_CONFIRM, the 02 round lifecycle, fixed timers, president-only override, add `idempotencyKey` + `by_idempotency_key` to paymentRecords, and decide that 05's `activityEvents` table is the single event log (serving as 02's transitions log), updating 01's excluded-tables section accordingly.

### [MAJOR] Group state set contradicts 02. 01 `groupStatusValidator` = `active | archived`; 02 §a defines `setup | active | paused | between_cycles | a

**Issue:** Group state set contradicts 02. 01 `groupStatusValidator` = `active | archived`; 02 §a defines `setup | active | paused | between_cycles | archived` with distinct allowed operations per state (e.g. paused freezes round timers but not record timers; between_cycles permits re-ordering).

**Fix applied:** Extend 01's validator to 02's five states and note the paused-state timer semantics (round timers frozen, `T_AUTO_DISPUTE`/`T_AUTO_CONFIRM` keep running) in §3.1.

### [MAJOR] Membership state set contradicts 02. 01: `invited | active | left | removed`; 02: `pending_approval | active | rejected | exited | deceased`

**Issue:** Membership state set contradicts 02. 01: `invited | active | left | removed`; 02: `pending_approval | active | rejected | exited | deceased` (approval gate is a DECISION — open links must not auto-admit; `deceased` drives edge case 2). 01 also lacks the `joinedMidCycle` flag (02 edge case 4), the `hasAccount` concept referenced by 02 and 05 M2 (01 derives it from absent `userId`), the `defaulting` badge after 2 unpaid rounds (02 edge case 1), and 01 allows treasurer-initiated removal ('removed by president/treasurer') where 02 makes exits president-only with mandatory note.

**Fix applied:** Adopt 02's five membership states in 01; add `joinedMidCycle: v.optional(v.boolean())`; state explicitly that `hasAccount` ≡ `userId !== undefined` (and update 02/05 to that phrasing, or store the flag); document `defaulting` as derived (2 consecutive unpaid rounds); make removal president-only with mandatory note.

### [MAJOR] 02's opening paragraph mandates an immutable `transitions` log table ('entityTable, entityId, fromState, toState, actor, note, createdAt — n

**Issue:** 02's opening paragraph mandates an immutable `transitions` log table ('entityTable, entityId, fromState, toState, actor, note, createdAt — no transition ever overwrites history') for EVERY entity transition. 01 has no such table and its §5 explicitly rejects an audit-log table. Meanwhile 05 (Week 1/Week 2/§C) requires an `activityEvents` table written on every state transition, and 04 §F adds a separate `events` analytics table. Three names, one missing from the schema doc.

**Fix applied:** Add one transition/activity log table to 01's schema satisfying 02's shape (it can double as the feed/metrics source), delete or amend the '§5 Audit-log table — deliberately out' row to reference it, and rename 05's `activityEvents` (and reconcile with 04 §F `events`) to the single chosen name.

### [MAJOR] Auto-dispute window configurability contradicts 02. 01 puts `confirmationWindowDays` (default 3) on `groups`, 'per-group because real njangi

**Issue:** Auto-dispute window configurability contradicts 02. 01 puts `confirmationWindowDays` (default 3) on `groups`, 'per-group because real njangis differ in strictness', and the §3.1 cron checks each record against its group's value. 02's timer table is an explicit DECISION: 'fixed app-wide in MVP (not group-configurable)', `T_AUTO_DISPUTE` = 72h in `convex/lib/timers.ts`. 03 B7 sides with 02 ('72h, configurable per group later').

**Fix applied:** Remove `confirmationWindowDays` from 01's groups table (or mark it post-MVP/unused), reference the fixed `timers.ts` constants in the §3.1 cron note, and simplify the `by_state_and_claimed_at` cron description to a single 72h cutoff over payer-side claims.

### [MAJOR] Dispute-resolution authority and exits contradict 02 and 04. 01 (§3.1 disputes note, §3.2 rows) routes `disputed → confirmed/cancelled` thro

**Issue:** Dispute-resolution authority and exits contradict 02 and 04. 01 (§3.1 disputes note, §3.2 rows) routes `disputed → confirmed/cancelled` through 'treasurer/president via dispute resolution'. 02 §d gives parties self-service exits (payee late-confirms → confirmed; payer withdraws → cancelled) and reserves override for the president ONLY; 04's role matrix likewise marks 'resolve Disputes' president-only. 01 also makes dispute `reason` an optional free string, while 02 transition 6 mandates a reason enum (`not_received|wrong_amount|other` + free text). And 01 omits 02's rule that cancelling a claimed/disputed record on an unmet obligation re-creates a fresh `pending` record.

**Fix applied:** In 01: restrict override resolution to president; add the payee-late-confirm and payer-withdraw exits as party actions; make `disputes.reason` a required union (`not_received|wrong_amount|other`) plus optional note; add the pending-re-creation rule (idempotent, skip if obligation satisfied/membership terminal) to §3.2.

### [MAJOR] Idempotency mechanism is missing/inconsistent. 05 Week 2 DECISION (a 00-endorsed review fix): client-generated UUID per claim/tap stored on 

**Issue:** Idempotency mechanism is missing/inconsistent. 05 Week 2 DECISION (a 00-endorsed review fix): client-generated UUID per claim/tap stored on paymentRecords with a `by_idempotency_key` index; 03 §D agrees ('client-generated UUID per PaymentRecord prevents dupes'). 01's paymentRecords table has neither the field nor the index. 04 §D uses a third scheme — natural key (`roundId`, `payerMembershipId`, `kind`) check-before-insert — which would wrongly dedupe a legitimate second partial payment (02 §e7 says multiple records per (member, round) are normal).

**Fix applied:** Add `idempotencyKey: v.string()` (client UUID) and `.index('by_idempotency_key', ['idempotencyKey'])` to 01's paymentRecords; change 04 §D's Meeting-Mode durability note to key replays on the UUID, not the natural key.

### [MAJOR] Meeting day/time is required by 02 (group creation: 'schedule..., meeting day/time') and 03 (B9 step 2 'Jour: [Sam ▾]'; B2 'Rythme : hebdoma

**Issue:** Meeting day/time is required by 02 (group creation: 'schedule..., meeting day/time') and 03 (B9 step 2 'Jour: [Sam ▾]'; B2 'Rythme : hebdomadaire · samedi'; §E 'Meeting reminder D-1 / D-0 morning' needs a meeting datetime), but 01's groups table has no such field — schedule is only `weekly|biweekly|monthly` and rounds carry a bare date.

**Fix applied:** Add `meetingDay` (and optional `meetingTime`) to 01's groups table, snapshot it onto cycles alongside `schedule`, and derive `dueAt` from it in `convex/lib/roundDates.ts`.

### [MAJOR] Cross-group score portability is MVP in 01/03/04 but LATER in 05. 01 §4: 'Scores aggregate across ALL groups', phone-keyed stats merged on s

**Issue:** Cross-group score portability is MVP in 01/03/04 but LATER in 05. 01 §4: 'Scores aggregate across ALL groups', phone-keyed stats merged on signup; 03 B8 headers the member profile with the cross-group score and « Le score suit Mama Ngozi dans tous ses njangis »; 04 §B specs the `scoreShareConsents` cross-group consent flow. 05 M13/L4 (reviewed): v1 is a per-group on-time ratio; 'cross-group portability is LATER'.

**Fix applied:** Annotate 01 §4's aggregation/merge mechanics as L4 post-MVP (the schema keying by user/phone can ship now; the cross-group read path waits), change 03 B8 to show the in-group score for MVP with the portability line marked as upcoming, and mark 04 §B's consent flow + `scoreShareConsents` table as L4. Alternatively promote portability in 05 — but pick one tier.

### [MAJOR] 02's score-event vocabulary cannot be expressed by 01's counters. 02 fixes events `round_unpaid` (§e1), `post_payout_default` ('the heaviest

**Issue:** 02's score-event vocabulary cannot be expressed by 01's counters. 02 fixes events `round_unpaid` (§e1), `post_payout_default` ('the heaviest penalty — weighted above ordinary unpaid rounds', §e3), and `fine_unpaid` (§f4), but 01 §4 stores only `onTimeCount`/`lateCount`/`disputedCount`, increments only on confirmed contributions or resolved-against disputes (an unpaid round changes nothing), and explicitly excludes fine behavior from the score. The two docs describe different scores.

**Fix applied:** Either add counters to 01 (`unpaidRoundCount`, `postPayoutDefaultCount`, `unpaidFineCount`) with weights in the derive function, or amend 02 §d/§e/§f to mark those three events as 'logged in the transitions table but unscored in MVP' (consistent with 05 M13's dumb-ratio v1). One event-to-counter mapping table, in one doc, referenced by the other.

### [MAJOR] On-time definition contradicts 02. 01 §4: on-time iff `paidAt ≤ endOfDay(scheduledDate) + onTimeGraceDays` — grace-period payments count as 

**Issue:** On-time definition contradicts 02. 01 §4: on-time iff `paidAt ≤ endOfDay(scheduledDate) + onTimeGraceDays` — grace-period payments count as ON-TIME. 02 §b closing rule 1: `on_time` = claims at or before `dueAt`; payments during grace are `late` (grace only delays the close, it doesn't extend timeliness). Same member, same payment, different score.

**Fix applied:** Align 01 §4's `dueCutoff` to `dueAt` (no grace credit) per 02, and drop/repurpose `onTimeGraceDays` accordingly — or, if grace-counts-as-on-time is the intended leniency, change 02 §b rule 1 instead. One cutoff definition.

### [MAJOR] OrderChange mechanism is missing and forbidden by 01's own invariant. 02 requires post-lock order changes via immutable OrderChange records 

**Issue:** OrderChange mechanism is missing and forbidden by 01's own invariant. 02 requires post-lock order changes via immutable OrderChange records (swap two future beneficiaries — 'begging the turn' — or remove an exited member's round, with subsequent rounds shifting; §a, §e1/e2), and round skips that shift all later rounds (§e8). 01's I-4 says `rotationOrder` is 'never written after status=active' and `beneficiaryMembershipId === rotationOrder[index-1]` — which makes 02's swaps/removals/shifts unimplementable. 05 M3 ('entries can be marked skipped... order itself immutable') conflates 02's round-skip with member removal and omits swaps.

**Fix applied:** Add an `orderChanges` table (cycleId, kind: swap|remove, affected memberships/rounds, presidentMembershipId, mandatory note, createdAt) to 01; relax I-4 to 'rotationOrder/round beneficiaries change only via an OrderChange record + the same mutation rewriting future rounds'; rewrite 05 M3's note to reference 02's OrderChange semantics (swap future turns, remove exited member's round, rounds shift on skip).

### [MINOR] Pending pre-creation covers 'every active membership' including the round's beneficiary, and 02 sets the payout default to members × contrib

**Issue:** Pending pre-creation covers 'every active membership' including the round's beneficiary, and 02 sets the payout default to members × contribution. Groups whose convention exempts the beneficiary from contributing to their own round (a common variant alongside everyone-pays) will see the beneficiary listed as owing on every Meeting Mode roll-call and a wrong payout default, forcing the treasurer to cancel a pending record and edit the payout amount every single round — recurring friction inside the killer feature.

**Fix applied:** Add a per-group beneficiaryContributes boolean (default true, snapshotted onto the cycle), applied at pending pre-creation and in the payout-amount default.

### [MINOR] users.phone is optional, but the account-claim merge (finding a feature-phone member's memberships and reliabilityStats by E.164 phone, per 

**Issue:** users.phone is optional, but the account-claim merge (finding a feature-phone member's memberships and reliabilityStats by E.164 phone, per §3.1 and 02 §55) is the entire upgrade path from feature phone to app user. A Clerk signup without a verified phone (e.g. Google OAuth) strands the member's history and portable score.

**Fix applied:** Keep the schema field optional but add a note: onboarding must capture and verify an E.164 phone before the user can join or be matched to a group (or document phone-OTP as the sole Clerk auth method); the claim-merge mutation runs at phone-verification time.

### [MINOR] Group-size figures are inconsistent across docs: 01 says 'Groups are ≤ ~50 members' (memberships index note) and '≤ 50 members' (rotationOrd

**Issue:** Group-size figures are inconsistent across docs: 01 says 'Groups are ≤ ~50 members' (memberships index note) and '≤ 50 members' (rotationOrder DECISION), while 05's applied fix is a hard cap of 40 members per group.

**Fix applied:** State 40 consistently in 01's notes (the in-memory-filtering and array-size rationales only get stronger).

### [MINOR] Member-cap mismatch: 01 says 'Groups are ≤ ~50 members' (memberships notes) and '≤ 50 names' (§5 search row); 05 Week 6 sets a hard MVP cap 

**Issue:** Member-cap mismatch: 01 says 'Groups are ≤ ~50 members' (memberships notes) and '≤ 50 names' (§5 search row); 05 Week 6 sets a hard MVP cap of 40 (creation/joins rejected above it, seed + Playwright specs exercise exactly 40). 01 also never says where the cap is enforced.

**Fix applied:** Replace both ~50 references with the hard 40 cap and note enforcement in the membership-create/approve mutation (count active + pending memberships before insert).

### [MINOR] Invite-code spec mismatch: 01 says '≥ 10 chars random' at path '/{inviteCode}'; 02 specifies 6 chars from a no-confusables alphabet (ABCDEFG

**Issue:** Invite-code spec mismatch: 01 says '≥ 10 chars random' at path '/{inviteCode}'; 02 specifies 6 chars from a no-confusables alphabet (ABCDEFGHJKLMNPQRSTUVWXYZ23456789) at '/j/{code}', regenerable, auto-invalidated when a cycle starts. The auto-invalidation rule also has no home in 01's groups table notes.

**Fix applied:** Adopt 02's spec in 01 (6-char no-confusable code, /j/ path — it must be dictatable over a phone call to a feature-phone member) and note cycle-start invalidation in the groups table notes.

### [MINOR] Three different timer models across docs: 01 has per-group `confirmationWindowDays` (default 3) and `onTimeGraceDays`, with a cron that chec

**Issue:** Three different timer models across docs: 01 has per-group `confirmationWindowDays` (default 3) and `onTimeGraceDays`, with a cron that checks each claimed record against its group's window; 02 fixes T_AUTO_DISPUTE=72h / T_AUTO_CONFIRM=48h app-wide ('DECISION: fixed app-wide in MVP, not group-configurable') with only GRACE_DAYS group-configurable; 05 Week 2 makes the dispute window kind-dependent (3d contributions, 7d payouts).

**Fix applied:** Pick one (02's fixed constants + configurable grace is the simplest solo-dev call and what the applied 05 fixes were aligned to; layer 05's per-kind payout window on top as a constant). Drop `confirmationWindowDays` from the groups table or mark it post-MVP; keep grace days configurable per 02.

### [MINOR] Subscriptions/CamPay (table, webhook handler, signature verification, I-9, premiumUntil entitlement gating on 'every SMS send and group-crea

**Issue:** Subscriptions/CamPay (table, webhook handler, signature verification, I-9, premiumUntil entitlement gating on 'every SMS send and group-creation gate') is presented as MVP build, but 05 defers premium billing to L5 (pilot groups get premium free for the cycle) and SMS to L6. Building merchant-PSP webhook plumbing inside the 4–6 week window is scope creep with zero pilot value.

**Fix applied:** Keep the table definition if you like (it is cheap and additive), but mark the webhook handler, entitlement checks, and I-9 as LATER (L5) in §3.1/§3.3 so they cannot leak into the build weeks; the free-tier 1-group limit is the only entitlement logic MVP needs.

### [MINOR] Cross-group portable reliabilityStats (user-or-phone keying, merge-on-signup account claim, scores aggregated 'across ALL groups') is L4 per

**Issue:** Cross-group portable reliabilityStats (user-or-phone keying, merge-on-signup account claim, scores aggregated 'across ALL groups') is L4 per 05: M13's MVP score is 'per-member on-time % within a group... cross-group portability is LATER' (impossible to matter before month 2). 01 specs the L4 design as MVP schema.

**Fix applied:** Either mark the phone-keying/merge machinery and cross-group aggregation as LATER in §4 (MVP = per-membership ratio per 05 M13), or keep the table shape as-is but state explicitly that MVP reads/display are group-scoped — one sentence either way, just stop the docs disagreeing on what Week 5 builds.

### [MINOR] payer == payee records are undefined. The treasurer's own contribution exists every round (payer = payee = treasurer membership), the payout

**Issue:** payer == payee records are undefined. The treasurer's own contribution exists every round (payer = payee = treasurer membership), the payout in the treasurer-as-beneficiary round is treasurer→treasurer, and 2-member groups (02 allows ≥2 at lock) make these degenerate handshakes a large share of all records. The two-sided handshake, auto-confirm timers, objection windows, and I-5 checks are all meaningless or circular for self-records, and no doc says what happens.

**Fix applied:** State in §3.2 that records where payerMembershipId === payeeMembershipId are created directly in confirmed (self-attestation, visible in the feed like everything else), skip all timers, and are exempt from the counterparty-only actor rules.

### [MINOR] Dispute-resolution authority contradiction surfaced by 04's role matrix: 04 §B and 02 §d both make resolution a president-only power ('résol

**Issue:** Dispute-resolution authority contradiction surfaced by 04's role matrix: 04 §B and 02 §d both make resolution a president-only power ('résolu par le président', presidentOverrides), but 01 says 'Resolution authority: treasurer or president (mutation-enforced)' and its §3.2 table routes disputed→confirmed/cancelled through 'treasurer/president'. A treasurer who can adjudicate disputes on records where they are the payee is self-dealing — 02/04 are right.

**Fix applied:** In 01, change the disputes-table note and the §3.2 transition rows to president-only resolution (treasurer may comment/attach proof per 02 §d, never resolve), and update the `resolvedByMembershipId` comment accordingly.

### [MINOR] 04 §C's SIM-swap mitigation depends on 'group-visible activity-feed events' for phone-number changes, rotation-order edits, and member remov

**Issue:** 04 §C's SIM-swap mitigation depends on 'group-visible activity-feed events' for phone-number changes, rotation-order edits, and member removals ('the attacker cannot do so silently'), but 01 deliberately excludes any feed/audit table ('paymentRecords + confirmations + disputes... ARE the audit trail') and its feed is just `paymentRecords.by_group` — phone changes and membership edits produce no feed row, so the takeover IS silent. 05 Week 1 already includes an `activityEvents` table (also needed for 02's many 'feed entry' references, OrderChange records, and presidentOverrides), so 01 is the odd doc out.

**Fix applied:** Add the `activityEvents` table to 01's schema (indexed `by_group` + createdAt), covering non-payment events: phone change, role reassignment, rotation OrderChange, member add/remove/approve, president overrides — making 04's social-audit mitigation and 02's feed entries actually writable.

### [MINOR] Invite code spec drift: 01 says '≥ 10 chars random' with join link `/{inviteCode}`; 02 says 6 chars uppercase from a confusion-free alphabet

**Issue:** Invite code spec drift: 01 says '≥ 10 chars random' with join link `/{inviteCode}`; 02 says 6 chars uppercase from a confusion-free alphabet with link `/j/K7PMQ4`; 03's route tree and wizard use `/join/:inviteCode`. Three lengths/paths for one feature.

**Fix applied:** In 01, adopt 02's 6-char uppercase code spec (it's the deliberate, typo-resistant design) and standardize the URL on 03's `/join/:inviteCode` (03 owns the route tree) — update 02's `/j/` example to `/join/` in the same pass.

### [MINOR] Group-size language drift: 01 repeatedly sizes for '≤ ~50 members' (rotationOrder array note, roster filtering, search-index exclusion); 05 

**Issue:** Group-size language drift: 01 repeatedly sizes for '≤ ~50 members' (rotationOrder array note, roster filtering, search-index exclusion); 05 Week 6 sets a hard MVP cap of 40 (a 00-endorsed review fix), with the max-size seed group at 40.

**Fix applied:** Update 01's sizing notes to cite the 40-member hard cap (mutation-enforced at create/join) per 05; the ≤50 engineering headroom can stay as a parenthetical.

### [MINOR] Transition-actor drift vs 02 in §3.2: `pending → cancelled` allows 'treasurer or president' (02 transition 13: system or president with mand

**Issue:** Transition-actor drift vs 02 in §3.2: `pending → cancelled` allows 'treasurer or president' (02 transition 13: system or president with mandatory note); `claimed → cancelled` says 'payer only' (02 transition 8: 'claimant only' — which includes payee-side claimants once the Meeting-Mode fix lands).

**Fix applied:** Align §3.2 actors to 02: pending-cancel = system/president (mandatory note); claimed-cancel = the claimant (either side), with the obligation re-created as `pending` when unmet.

### [MINOR] 03 §C and 05 R3 both decide USSD instruction content is stored as remotely-updatable, versioned Convex data ('Convex doc, not hardcoded' / '

**Issue:** 03 §C and 05 R3 both decide USSD instruction content is stored as remotely-updatable, versioned Convex data ('Convex doc, not hardcoded' / 'versioned Convex data... updatable without app release'), but 01's schema has no table for it.

**Fix applied:** Add a small `ussdContent` (or generic `remoteContent`) table to 01 — keyed by method + locale + version — and reference it from §3.1.

## 02-lifecycle-state-machines (43 issues)

### [MAJOR] Payout to a living feature-phone beneficiary has no confirmation path. The treasurer claims the payout (payer-side); the beneficiary has no 

**Issue:** Payout to a living feature-phone beneficiary has no confirmation path. The treasurer claims the payout (payer-side); the beneficiary has no app, so silence is guaranteed and T_AUTO_DISPUTE fires (02 §121 explicitly accepts this) — every payout to a feature-phone beneficiary becomes a « litige » and the round stalls in 'payout'. 02 allows president on-behalf confirms for hasAccount:false payers (#167) and a president override for deceased beneficiaries (§216), but nothing for this entirely routine case, despite locked decision 7 promising feature-phone support. Routing routine cash handovers — publicly witnessed at the réunion — through a dispute label is exactly the trust-destroying outcome the spec elsewhere avoids.

**Fix applied:** Allow the president (never the paying treasurer — no self-confirmation) to record the payee-side confirmation on behalf of a hasAccount:false beneficiary, mandatory note + SMS receipt to the beneficiary's phone, mirroring the existing on-behalf and deceased-override rules. In 01, add recordedByMembershipId to the confirmations table so on-behalf acknowledgments are auditable (the field exists on paymentRecords but not on confirmations).

### [MAJOR] §f's automated fine machinery (fineProposals table generated at round close, finesEnabled policy, proposed/confirm/dismiss/auto-dismiss flow

**Issue:** §f's automated fine machinery (fineProposals table generated at round close, finesEnabled policy, proposed/confirm/dismiss/auto-dismiss flow) is LATER scope per the reviewed 05: M14 is manual fine entry (~1 day) and L2 explicitly demotes 'fines automation (auto-assess lateness, configurable fine rules)'. 01 agrees with 05 (manual-only, 'no auto-fining cron in MVP'). 02 is the outlier; anyone building round-close from 02 will build L2. The two docs also disagree on the fines data model: 01 has a `fines` obligations table settled by paymentRecords with `fineId`; 02 has fineProposals creating pending PaymentRecords directly with `fineProposalId`.

**Fix applied:** In 02 §f, mark the proposal pipeline (steps 1–2, auto-dismiss, policy fields) as post-MVP (L2) and describe MVP as 05 M14: treasurer manually creates a fine → pending kind:'fine' PaymentRecord → standard handshake. Standardize on 01's fines table + fineId reference (or drop the obligations table entirely for MVP and let the pending record be the obligation — simpler still).

### [MAJOR] 02 §b pre-creates the payout record at round open with a computed amount (members × contribution), contradicting 05 M8's applied review deci

**Issue:** 02 §b pre-creates the payout record at round open with a computed amount (members × contribution), contradicting 05 M8's applied review decision: payout amount is 'entered by treasurer at claim time — app records reality, never computes/asserts an owed amount (also safer under R4/R7)'. An app-computed amount the group treats as authoritative is exactly the 'app said it was paid/owed' exposure R7 names, and shortfall rounds make the computed figure wrong by construction. 01 is silent on payout-record creation timing entirely, so the schema doc gives the builder no rule at all.

**Fix applied:** In 02: pre-create the payout record without an asserted amount (or create it lazily at treasurer claim) with the amount treasurer-entered, per 05 M8. In 01 §3.1 paymentRecords: state explicitly that payout records are created/claimed with a treasurer-entered amount and are exempt from any expected-amount math.

### [MAJOR] Treasurer is hard-coded as payee for all contributions and assistance (§c kind table, §f). Many real Cameroonian njangis — especially MoMo-b

**Issue:** Treasurer is hard-coded as payee for all contributions and assistance (§c kind table, §f). Many real Cameroonian njangis — especially MoMo-based and simple rotating ones — hand/send the contribution directly to the round's beneficiary; routing member→treasurer→beneficiary forces a double MoMo hop with real transfer/cashout fees. Groups will keep sending direct and the ledger then cannot represent the truth (treasurer would have to falsely log 'received'), breaking 'truth = payee confirmation' because the actual payee is not the record's payee.

**Fix applied:** Add a per-group collection mode `via_treasurer | direct_to_beneficiary` that sets contribution-record payee to the round beneficiary (payout record exists only in treasurer mode; Meeting Mode unchanged in treasurer mode). At absolute minimum, document this as a known simplification and add it as a week-1 pilot validation question in 05-mvp-plan.

### [MAJOR] Cycle-lock guard 'order contains every active member exactly once' (§a Rotation order) and 'one Round per member' (§a Cycle start) forbid mu

**Issue:** Cycle-lock guard 'order contains every active member exactly once' (§a Rotation order) and 'one Round per member' (§a Cycle start) forbid multiple hands ('deux mains'/'deux noms'/'double hand') — a member holding 2+ positions, contributing 2x and receiving 2 rounds. This is extremely common in real njangis/tontines and will surface during pilot recruitment.

**Fix applied:** Allow a member to appear N times in the rotation order (handsCount on the position or membership): N rounds as beneficiary, contribution obligation = fixed amount x N per round (pre-created record amount adjusted). If genuinely deferred, state the deferral explicitly in §a and add 'no multi-hand groups' to the pilot screening criteria in 05.

### [MAJOR] T_AUTO_DISPUTE = fixed 72h after claim collides with the doc's own design: rounds open at the start of the period (§b: monthly group opens d

**Issue:** T_AUTO_DISPUTE = fixed 72h after claim collides with the doc's own design: rounds open at the start of the period (§b: monthly group opens day 1, réunion day 28) so members are encouraged to pay early, while treasurers culturally reconcile at the réunion. Every early MoMo self-log whose treasurer doesn't open the app within 3 days becomes 'Litige ouvert sur {amount}' pushed to payer, payee, president, treasurer AND the group feed. In njangi culture a public 'litige' against the treasurer reads as an embezzlement accusation; a feed full of false litiges will alienate the treasurer (the buyer) and push groups back to WhatsApp — a named kill signal.

**Fix applied:** Keep the locked auto-dispute mechanism but anchor the timer: auto-dispute fires at max(claimedAt + 72h, dueAt) so it never fires before the réunion; escalate privately first (extra reminder to payee + president) and use neutral copy ('Paiement non confirmé — à vérifier') reserving the word 'litige' and the group-feed broadcast for human-initiated contests or post-dueAt silence.

### [MAJOR] Feature-phone payout beneficiaries deadlock the payout handshake. Payout is a payer-side claim by the treasurer requiring payee confirmation

**Issue:** Feature-phone payout beneficiaries deadlock the payout handshake. Payout is a payer-side claim by the treasurer requiring payee confirmation, but a hasAccount:false beneficiary has no device to confirm with; §c row 4's proxy rule covers the president acting only for a feature-phone PAYER. Result: every payout to a feature-phone beneficiary auto-disputes at T_AUTO_DISPUTE and needs a president override — for a routine, publicly-witnessed handover at the réunion.

**Fix applied:** Extend row 4's guard to feature-phone payees: president (or designated non-party officer) confirms on the beneficiary's behalf, logged as 'confirmé par le président pour {name}', with an SMS receipt to the beneficiary mirroring the Meeting Mode SMS ('Si erreur, contactez {presidentPhone}').

### [MAJOR] Fines (§f) only auto-propose from payment statuses (late/partial/unpaid), but in real njangis the dominant fine type is meeting-discipline f

**Issue:** Fines (§f) only auto-propose from payment statuses (late/partial/unpaid), but in real njangis the dominant fine type is meeting-discipline fines from the règlement intérieur: absence at the réunion, lateness to the meeting, disorder. The president has no way to record these, so the 'fines tracked' wedge (locked decision 6/7) misses most actual fines and groups keep the paper notebook for them.

**Fix applied:** Add president-created manual fines reusing the exact same machinery: president creates a fineProposal with reason 'manual' + free-text label and amount, then the existing confirm → PaymentRecord(kind:'fine') → handshake flow applies unchanged.

### [MAJOR] Assistance levies (§f) collect member→treasurer with no disbursement record to the bereaved family/recipient, and edge cases #1/#2/#3 prescr

**Issue:** Assistance levies (§f) collect member→treasurer with no disbursement record to the bereaved family/recipient, and edge cases #1/#2/#3 prescribe ad-hoc 'payout-kind records with note' that violate 01-domain-model invariant I-5 (roundId required for kind payout). Consequences: the §e.5 handover statement (cash-on-hand = ... + assistance − confirmed payouts) permanently inflates because assistance money handed over is never decremented, and the recipient's receipt is never acknowledged in the ledger.

**Fix applied:** Add a round-independent disbursement record (either a new kind 'disbursement' or relax I-5 to allow roundId-less payouts linked to an assistanceLevyId/membership) for treasurer→recipient handovers, refunds, and family settlements; it goes through the standard handshake and subtracts from cash-on-hand. Reconcile invariant I-5 in 01-domain-model accordingly.

### [MAJOR] Obligation-status freeze semantics (§b closing rule 1) are self-contradictory and fine-generating: 'on_time = sum of eventually-confirmed re

**Issue:** Obligation-status freeze semantics (§b closing rule 1) are self-contradictory and fine-generating: 'on_time = sum of eventually-confirmed records claimed before dueAt' cannot be evaluated at graceEndAt when records are still 'claimed'; rule 2 says the frozen status 'stands', yet §d says a resolved dispute 'counts with its original claimedAt for timeliness' (retroactive). Worst case: a member who claimed on time but whose treasurer hadn't confirmed by close gets frozen as partial/unpaid and auto-proposed a fine — fining someone who actually paid is culturally explosive and exactly the favoritism/abuse story the app must avoid.

**Fix applied:** Define one rule: obligation status is provisional at close; in-flight claimed/disputed records that later resolve to confirmed recompute the status using claimedAt (records first claimed after close can never improve it); fine proposals from provisional statuses are auto-withdrawn (with feed trace) if the status improves before the president confirms the fine.

### [MAJOR] §c rows 11/12 and §d let a president override transition 'confirmed → cancelled' by mutating the record's state, directly contradicting 01-d

**Issue:** §c rows 11/12 and §d let a president override transition 'confirmed → cancelled' by mutating the record's state, directly contradicting 01-domain-model §3.4 where confirmed rows are never patched and corrections are NEW amendment records requiring a two-sided handshake. Two incompatible correction models (unilateral president mutation vs bilateral amendment) for the trust-critical 'immutable history' product; implementation hits this wall immediately.

**Fix applied:** Reconcile: president override should create an amendment record (amendmentKind 'override_reversal', president as actor, mandatory note, no counterparty handshake needed) plus the presidentOverrides row, leaving the original confirmed row untouched per 01 §3.4; update the §c mermaid/table so 'confirmed' has no state-mutating exit.

### [MAJOR] Creator is hard-coded as role 'president' (§a Group creation), but locked decision 5 says the champion/buyer is often the TREASURER. When a 

**Issue:** Creator is hard-coded as role 'president' (§a Group creation), but locked decision 5 says the champion/buyer is often the TREASURER. When a treasurer-champion creates the group, the app crowns them 'président', the real (often older, less digital) president has no app authority, and every override badge ('résolu par le président') misattributes who actually decided — socially wrong in a hierarchy-conscious njangi.

**Fix applied:** Ask the creator's actual role at creation and allow assigning/transferring the president role to another active membership (with a feed entry); alternatively decouple the app permission role ('admin') from the social title displayed in badges. Onboarding screens in 03-screens-ux must follow.

### [MAJOR] No dissolution path mid-cycle: 'archived' is reachable only from setup/between_cycles, completing a cycle requires every round's payout conf

**Issue:** No dissolution path mid-cycle: 'archived' is reachable only from setup/between_cycles, completing a cycle requires every round's payout confirmed, and skip only shifts rounds later. A group that collapses after a default crisis (the doc's own nightmare case #3 — the most likely real-world failure) is stuck as a permanent zombie in active/paused; the treasurer cannot close it out and the 'immutable record forever' pitch has no way to record the dissolution.

**Fix applied:** Add president action 'dissoudre le groupe' (active|paused → archived, mandatory note): bulk-cancel pending records, keep arrears records open-but-frozen and all history readable/exportable, emit appropriate score events, post a final dissolution summary to the feed.

### [MAJOR] Custody-creep framing risk in §e.5: the handover statement displays an aggregate 'ledger cash-on-hand' balance with no specified attribution

**Issue:** Custody-creep framing risk in §e.5: the handover statement displays an aggregate 'ledger cash-on-hand' balance with no specified attribution copy. Under active CEMAC 04/18 enforcement, an in-app screen titled 'Solde en caisse: 240 000 FCFA' is the single most custody-looking artifact in the spec — a regulator screenshot away from 'app shows balances as if held'. The architecture is clean (it describes physical cash held by the treasurer), but the doc must mandate the framing.

**Fix applied:** Specify the screen title and disclaimer in §e.5: e.g. 'Espèces chez le trésorier (selon le registre) — l'application ne détient aucun fonds', shown wherever the figure appears (handover screen, exports). Add 'solde'/'caisse' unattributed-balance phrasing to 04-non-functional's CI copy-scan list.

### [MAJOR] Round `skipped` is drawn as terminal (skipped → [*]) but §e8 says a skipped round's pending records are 'cancelled and re-created when the r

**Issue:** Round `skipped` is drawn as terminal (skipped → [*]) but §e8 says a skipped round's pending records are 'cancelled and re-created when the round re-opens' and that the beneficiary is NOT skipped over — i.e. the round shifts one period and runs later. A terminal state that re-opens is a contradiction. Separately, edge cases 1/2 'remove an exited member's future Round from the cycle', but the round machine has no cancelled/removed state to remove it INTO (and 01's I-4 forbids touching rounds after lock).

**Fix applied:** Model skip as a date-shift, not a state: the round stays/returns to `scheduled` with shifted scheduledOpenAt/dueAt/graceEndAt (pending records cancelled and re-created on re-open, as already written). Add a genuine terminal `cancelled` state used only for exited/deceased members' future rounds, and relax I-4 in 01 to permit that one system write.

### [MAJOR] A hasAccount:false (feature-phone), deceased, or exited beneficiary can never confirm a payout. Transition 4's on-behalf guard covers only '

**Issue:** A hasAccount:false (feature-phone), deceased, or exited beneficiary can never confirm a payout. Transition 4's on-behalf guard covers only 'president acting for a hasAccount:false PAYER', and president override exists only from `disputed` (row 11). So every such payout must rot 72h to auto-dispute, blast 'Litige ouvert' pushes to the whole group, then be overridden — polluting the ≤20% dispute kill-signal metric. This also contradicts 05 M8 ('president confirms on their behalf… no deadlock') and 02's own edge 2(b), whose 'confirmed by the president on the family's behalf via override-with-note' has no supporting transition from `claimed`.

**Fix applied:** Extend transition 4: the president may confirm on behalf of any counterparty (payer OR payee) whose membership is hasAccount:false, exited, or deceased — logged as acting-on-behalf, feed-labeled 'attesté par le président'. Give the president the symmetric on-behalf dispute right (transition 6) so the objection window for feature-phone payers isn't fictional.

### [MAJOR] The treasurer is also a contributing member with a rotation slot, so EVERY round pre-creates one self-record (contribution payer = payee = t

**Issue:** The treasurer is also a contributing member with a rotation slot, so EVERY round pre-creates one self-record (contribution payer = payee = treasurer's membership) and once per cycle the payout has payer = payee (treasurer's own beneficiary round). The two-sided handshake is meaningless when one person is both sides: who confirms, which claimedBySide applies, which auto-timer runs? The doc acknowledges president-as-treasurer visibility but never addresses payer==payee records, which occur in 100% of rounds in 100% of groups (worst in the 2-member case).

**Fix applied:** Spec self-records explicitly: created directly in `confirmed` with a feed label 'auto — même personne' (excluded from reminder/auto-dispute timers), or route the treasurer's own contribution to the president as payee for a real cross-check. Either way, one sentence + one guard; pick now so mutations and the pilot entry-metric denominator are right.

### [MAJOR] Partial payments have no mid-round top-up path. The machine's only entry is '(create) → pending' by the system at round open; a partial clai

**Issue:** Partial payments have no mid-round top-up path. The machine's only entry is '(create) → pending' by the system at round open; a partial claim consumes the member's single pre-created pending record, and §e7 only splits the shortfall into a new pending record 'at round close'. So a member who sends 5,000 of 10,000 on day 2 cannot log the remaining 5,000 until after graceEndAt, despite §e7 asserting 'multiple PaymentRecords per (member, round) are normal'.

**Fix applied:** Perform the split at claim time, not close: when a claim is logged for less than the outstanding obligation, the system immediately re-creates a `pending` record for the shortfall (same mechanism already specced for cancellation re-creation, same idempotency guard). Round-close rule 2 then only flags whatever pending remains.

### [MAJOR] Closing rule 1 freezes each member's obligation status at graceEndAt using 'eventually-confirmed' records — a value unknowable at close, sin

**Issue:** Closing rule 1 freezes each member's obligation status at graceEndAt using 'eventually-confirmed' records — a value unknowable at close, since rule 3 explicitly lets claimed-unconfirmed records keep running their timers past close. If a claim made before dueAt confirms (or dispute-cancels) days later, the 'frozen' on_time/partial/unpaid status is wrong, and rule 2 ('frozen status stands') contradicts rule 1's eventually-confirmed definition and §d's 'counts with its original claimedAt'. The fine proposals and score events generated at close inherit the wrong status.

**Fix applied:** Make close-time status provisional for in-flight claimed records: compute from claims at close (claimedAt vs dueAt), then finalize when the last in-flight record reaches a terminal state — confirm keeps the provisional status, dispute-cancellation downgrades it (and retro-adjusts the score event; fine proposal generated then if newly offending). State this explicitly so the Convex implementation isn't invented under deadline.

### [MAJOR] Invite-code contradiction: §Invites says the group code is 'auto-invalidated when a cycle starts', but edge case 4 says joins via code DURIN

**Issue:** Invite-code contradiction: §Invites says the group code is 'auto-invalidated when a cycle starts', but edge case 4 says joins via code DURING an active cycle are accepted into pending_approval with joinedMidCycle:true and a 'Prochain cycle' list. As written, no one can join during a cycle at all — for a monthly 25-member group that's two years of closed enrollment, killing the champion-driven growth loop.

**Fix applied:** Keep the code valid during active cycles with edge-4 semantics (joins land in pending_approval, approvals create joinedMidCycle members with no obligations); reserve invalidation for explicit regeneration. Delete the 'auto-invalidated when a cycle starts' sentence.

### [MAJOR] Round-open pre-creation says 'one contribution record per ACTIVE member', but edge 4's mid-cycle joiners are status `active` (flagged joined

**Issue:** Round-open pre-creation says 'one contribution record per ACTIVE member', but edge 4's mid-cycle joiners are status `active` (flagged joinedMidCycle) and must 'receive no rounds, owe no contributions'. As written, the next round-open bills them.

**Fix applied:** Either filter joinedMidCycle:true out of pre-creation (one guard clause, stated in §b Opening rules), or keep mid-cycle approvals parked in a non-active status (e.g. `awaiting_cycle`) until the next cycle's draft — cleaner, since it also keeps them out of 'active member' counts everywhere else.

### [MAJOR] §f is scope creep that re-litigates a reviewed decision: 05's M14/L2 (post-review, fixes applied per 00) locked MANUAL fine entry with 'auto

**Issue:** §f is scope creep that re-litigates a reviewed decision: 05's M14/L2 (post-review, fixes applied per 00) locked MANUAL fine entry with 'automation stays L2', and 01 decided 'no auto-fining cron in MVP'. 02 instead specs a full engine: fineProposals rows generated at round close, confirm/dismiss UI with editable amounts, stale-proposal auto-dismiss cron, dismissed-trace UI — plus a `fineProposals` table that exists in no schema. Multiple extra days of solo-dev work for a feature the plan demoted. Same applies to the assistance-levy paragraph (05 demotes levies to L3) presented here as MVP machinery.

**Fix applied:** Rewrite §f to M14's flow: treasurer manually logs a fine (member, amount with lateFineAmount as one-tap suggestion, reason) → pending fine PaymentRecord → standard handshake. Move the proposal engine and auto-dismiss rules to a clearly-labeled LATER subsection, and annotate the assistance-levy paragraph as L3 (schema kind ships, UI later).

### [MAJOR] OrderChange beneficiary swaps ('begging the turn') are specced as MVP but the other two docs disagree: 05 M3 (reviewed) includes only markin

**Issue:** OrderChange beneficiary swaps ('begging the turn') are specced as MVP but the other two docs disagree: 05 M3 (reviewed) includes only marking entries skipped — no swaps — and 01's rotationOrder is 'never written after active' (I-4) with swaps explicitly named as the post-MVP override trigger. Three docs, three answers. Note the exit-removal half of OrderChange is NOT demotable — edge cases 1/2 require it — and it already violates I-4 on its own.

**Fix applied:** Split OrderChange in two: keep system removal of an exited/deceased member's future round (mandatory for edge cases 1/2; amend 01's I-4 to 'effective beneficiary lives on rounds, mutable only via an immutable OrderChange/transitions entry'). Demote the two-beneficiary swap to LATER to match M3, or, if kept, add it to 05 M3 and 01 in the same pass — it cannot stay specified in only one doc.

### [MAJOR] Treasurer replacement (§e5) re-points payeeMembershipId of `claimed` and `disputed` records to the NEW treasurer. Those records assert money

**Issue:** Treasurer replacement (§e5) re-points payeeMembershipId of `claimed` and `disputed` records to the NEW treasurer. Those records assert money already handed to the OLD treasurer — the new treasurer cannot truthfully confirm receiving cash they never received, and becoming a party to a predecessor's dispute is worse. This breaks the locked truth rule (truth = payee confirmation) for exactly the records where it matters, during the scenario 05 lists as risk R2.

**Fix applied:** Re-point only `pending` records. `claimed` and `disputed` records keep the old treasurer as payee — they must still confirm or resolve what they allegedly received (the handover statement already gives both treasurers the reconciliation surface). Add one line covering an old treasurer who is fully gone: president resolves their leftover records via the on-behalf/override path.

### [MAJOR] No way to end a group mid-cycle: `archived` is reachable only from setup and between_cycles, `paused` only exits to `active`, and there is n

**Issue:** No way to end a group mid-cycle: `archived` is reachable only from setup and between_cycles, `paused` only exits to `active`, and there is no cycle-cancel flow at all (01 even has cycleStatus 'cancelled' that 02 never uses). A group that implodes, dissolves, or locked a wrong setup (wrong amount discovered after lock) is trapped in active/paused forever — and a quitting pilot group (an explicitly anticipated kill-signal scenario, with a 'leave with your data' promise in 05's checklist) cannot be archived read-only.

**Fix applied:** Add president-only 'terminate cycle' (mandatory note): pending records cancelled (transition 13), claimed/disputed records must still resolve via the normal handshake/override, then group → between_cycles, from which archive already works. The cycle's terminal state is `cancelled`, matching 01's existing validator.

### [MAJOR] 04 §C's 'treasurer absconds' mitigation claims 'a Round whose Contributions are confirmed but whose Payout stays unconfirmed past X days is 

**Issue:** 04 §C's 'treasurer absconds' mitigation claims 'a Round whose Contributions are confirmed but whose Payout stays unconfirmed past X days is auto-flagged Disputed to the whole Group' — but 02's machine has no timer on pending (unclaimed) records: T_AUTO_DISPUTE only fires after a payer-side CLAIM, and 02 §b explicitly scopes payout auto-dispute to 'if treasurer claimed'. An absconding treasurer simply never claims the payout, the round sits silently in `payout` forever, and the app's core anti-theft visibility promise ('the ledger makes it visible fast') never fires. Treasurer flight with the caisse is THE njangi failure mode the trust pitch is sold on.

**Fix applied:** Add to 02: a stuck-payout escalation timer (e.g. T_PAYOUT_STALE — payout record still `pending` N days after round close → group-visible feed alert + push to president + prompt to beneficiary 'Avez-vous reçu votre versement ?', repeating weekly like T_DISPUTE_STALE). Then reword 04 §C to describe this mechanism instead of a nonexistent pending→disputed auto-flag.

### [MAJOR] Members holding multiple hands ('deux mains' — one person holding two positions in the rotation, contributing double) are impossible: 02's c

**Issue:** Members holding multiple hands ('deux mains' — one person holding two positions in the rotation, contributing double) are impossible: 02's cycle-lock guard requires 'order contains every active member exactly once'. Multiple hands are routine in Cameroonian njangis and will surface during in-person setup of pilot group #1; this is distinct from the deliberately demoted L9 (variable contribution amounts). 01's rotationOrder array-on-cycle would trivially support duplicate membership ids — only the guard forbids it.

**Fix applied:** Relax the cycle-lock guard to 'order contains every active member at least once' so a membership can hold N slots (N rounds, N pre-created contribution records per round — the existing machinery handles the rest). Also add an intake question in 05 §C: 'does any member hold more than one hand?' — and if 02 is not changed for MVP, screen such groups out knowingly rather than discovering it at the réunion.

### [MAJOR] No operation to move a réunion by a few days. Real meetings shift constantly (deuils, fêtes, travel). The only tools are skip (shifts the ro

**Issue:** No operation to move a réunion by a few days. Real meetings shift constantly (deuils, fêtes, travel). The only tools are skip (shifts the round a FULL schedule period — wrong for a 5-day postponement) and group pause (heavyweight, freezes round timers). Because obligation status on_time requires claimedAt ≤ dueAt and grace does not restore on_time, a réunion postponed 5 days marks every member 'late', auto-proposes a fine for each (president must dismiss 20 proposals one by one), and permanently dents reliability scores — the wedge feature — for behavior that was not late in the group's own eyes. 05's kill-signal metric 1 ('claimed within 48h of due/réunion date') is also corrupted by this.

**Fix applied:** Add a president-only 'déplacer la réunion' operation on a scheduled/open round: edits dueAt (and graceEndAt) by up to one schedule period, mandatory note, feed entry + push to all members; on_time, reminders, fine proposals, and 05's metric 1 all evaluate against the moved dueAt. Later rounds unaffected.

### [MAJOR] Fines flow forks against 01 and reviewed 05. 02 §f auto-generates `fineProposals` rows at round close (president confirms/dismisses; stale p

**Issue:** Fines flow forks against 01 and reviewed 05. 02 §f auto-generates `fineProposals` rows at round close (president confirms/dismisses; stale proposals auto-dismiss; record links `fineProposalId`). 01 §3.1 has an explicit DECISION the other way ('fines are issued manually by the treasurer... No auto-fining cron in MVP') with a `fines` obligation table (`fineId`, statuses owed/paid/waived/cancelled), and 05 M14/L2 lock manual entry for MVP with automation demoted — a fix 00's review record says was applied. Reason vocabularies also differ (01: `late_contribution|missed_meeting|other`; 02: `late|partial|unpaid`).

**Fix applied:** Rewrite 02 §f for MVP as manual issuance (treasurer/president logs member + amount + reason → 01's `fines` obligation row → `pending` kind:fine PaymentRecord referencing `fineId`), moving the `fineProposals` auto-proposal pipeline to an explicit post-MVP note (it maps to 05 L2). Align the reason enum with 01's, or extend 01's enum — one list. (02 changes here, not 01/05, because 00's locked review status endorses 05's fines→M14 scope.)

### [MAJOR] 02 bakes SMS into MVP mechanics — feature-phone SMS receipts on payee-side claims (§c), 'SMS to feature-phone members' on round open (§b), f

**Issue:** 02 bakes SMS into MVP mechanics — feature-phone SMS receipts on payee-side claims (§c), 'SMS to feature-phone members' on round open (§b), fine SMS (§f step 3) — while 03 §E premium-gates ALL SMS and 05 L6 defers SMS entirely for the pilot. Worse, 02's silence-is-acceptance auto-confirm for feature-phone members assumes a receipt channel that won't exist during the pilot.

**Fix applied:** In 02, mark every SMS mention as premium/L6 post-pilot, and add one explicit sentence to §c: during the pilot, feature-phone members' notice channel is the group feed + treasurer/président contact (per 05 Week 4), so payee-side auto-confirm proceeds without an SMS receipt — a consciously accepted gap, not an oversight.

### [MINOR] §d includes an 'immutable comment log' on disputed records (add comment / attach proof by payer, payee, treasurer, president, 'running resol

**Issue:** §d includes an 'immutable comment log' on disputed records (add comment / attach proof by payer, payee, treasurer, president, 'running resolution thread'), but 05 demotes evidence threads to L1 ('Full evidence-thread UI stays LATER') and 01's schema has no comments table — only disputes.reason/resolutionNote and confirmations.note.

**Fix applied:** Mark the comment/proof-thread rows in 02 §d as L1; MVP dispute artifacts = the dispute's reason, the record's existing proof fields, and the resolution note, which 01's schema already covers.

### [MINOR] Invite-code contradiction: §a says the group invite code is 'auto-invalidated when a cycle starts', but edge case #4 says joins via code dur

**Issue:** Invite-code contradiction: §a says the group invite code is 'auto-invalidated when a cycle starts', but edge case #4 says joins via code during an active cycle are still accepted into pending_approval with joinedMidCycle:true. Both cannot be true; an implementer will pick one at random.

**Fix applied:** Resolve in favor of #4 (matches njangi reality — people are recruited at réunions year-round): code stays valid during cycles, joiners land in the 'Prochain cycle' pending list; delete the auto-invalidation sentence in §a.

### [MINOR] Skipped-round contradiction: §b's state machine shows 'skipped' as terminal, but §e.8 says a skipped round's pending records are 'cancelled 

**Issue:** Skipped-round contradiction: §b's state machine shows 'skipped' as terminal, but §e.8 says a skipped round's pending records are 'cancelled and re-created when the round re-opens' and the beneficiary is not skipped over — i.e., the round shifts and runs later, it doesn't die. The terminal 'skipped' state has no remaining clear use (exited-member rounds are 'removed', not skipped).

**Fix applied:** Model skip as a date shift returning the round to 'scheduled' (with an immutable shift note), or define 'skipped' as terminal for the calendar slot while a new shifted round is materialized; update the mermaid and §e.8 to agree.

### [MINOR] Paused groups (§a) list allowed operations as 'confirmations, disputes, dispute resolution' — claiming is excluded. Real groups pause for fê

**Issue:** Paused groups (§a) list allowed operations as 'confirmations, disputes, dispute resolution' — claiming is excluded. Real groups pause for fêtes/crises but members keep paying arrears and late contributions (often exactly when remittance money arrives); refusing claims pushes that money off-ledger.

**Fix applied:** Allow claims on already-open rounds and on arrears records while paused (only opening NEW rounds is frozen); state it explicitly in the paused row.

### [MINOR] French copy register and hardcoded constants in notification strings: 'Écriture annulée par le président' uses accountant jargon ('écriture'

**Issue:** French copy register and hardcoded constants in notification strings: 'Écriture annulée par le président' uses accountant jargon ('écriture') opaque to a low-literacy market trader; row 7's copy hardcodes 'après 3 jours' (lies if T_AUTO_DISPUTE changes); 'Je conteste' is more legalistic than the reason codes it fronts.

**Fix applied:** Use plain transactional French: 'Paiement annulé par le président', interpolate the timer ('après {n} jours'), prefer concrete verbs ('Je n'ai pas reçu' as the primary dispute entry point). Align with the copy guide in 03-screens-ux.

### [MINOR] Timer config disagrees across docs: 02 fixes T_AUTO_DISPUTE at 72h app-wide for all kinds; 05 Week 2 (reviewed) decided 3 days for contribut

**Issue:** Timer config disagrees across docs: 02 fixes T_AUTO_DISPUTE at 72h app-wide for all kinds; 05 Week 2 (reviewed) decided 3 days for contributions but 7 for payouts; 01 has a per-group confirmationWindowDays field (contradicting 02's 'fixed app-wide, not group-configurable' DECISION).

**Fix applied:** Keep 02's fixed-constants model (right call for solo-dev), add a T_AUTO_DISPUTE_PAYOUT = 7d row to the constants table per 05, and delete confirmationWindowDays from 01 (GRACE_DAYS stays per-group as 02 already states, mapping to 01's onTimeGraceDays).

### [MINOR] 02 writes SMS sends as MVP behavior throughout (round-open SMS to feature-phone members, SMS receipts on payee-side claims and confirms, fin

**Issue:** 02 writes SMS sends as MVP behavior throughout (round-open SMS to feature-phone members, SMS receipts on payee-side claims and confirms, fine SMS), but 05 demotes ALL SMS to L6 — in the pilot, feature-phone payers get no receipt and no objection channel before the 48h auto-confirm; per 05 Week 4 the public feed is their receipt. A dev building from 02 alone would wire an SMS gateway in week 3.

**Fix applied:** Annotate every SMS mention in 02 as 'L6 / premium — not pilot' and state the pilot fallback (treasurer announces at the réunion; president contactable per the receipt copy). Flag for the resumed review pass that L6 sits in tension with locked decision 7's 'treasurer logs for them + SMS receipt' — that call belongs in 00/05, not here.

### [MINOR] Transition 1's guard ('round open; membership active') is violated by 02's own edge case 3, which materializes arrears records immediately f

**Issue:** Transition 1's guard ('round open; membership active') is violated by 02's own edge case 3, which materializes arrears records immediately for FUTURE (scheduled) rounds of an EXITED membership when a post-payout defaulter is removed.

**Fix applied:** Scope the guard to the standard round-open path and add an explicit exemption: system arrears materialization may create pending records against scheduled rounds and terminal memberships (the records carry isArrears and the exited membershipId).

### [MINOR] The 40-member hard cap (05 Week 6 DECISION, and one of the seeded test fixtures) appears nowhere in 02: member approval, direct feature-phon

**Issue:** The 40-member hard cap (05 Week 6 DECISION, and one of the seeded test fixtures) appears nowhere in 02: member approval, direct feature-phone add, and the cycle-lock guards (`≥ 2 active members`) have no upper bound.

**Fix applied:** Add the cap to the approve-member and direct-add operations ('reject above 40 active+pending memberships') and note '2 ≤ active members ≤ 40' in the cycle-lock guard list.

### [MINOR] §b pre-creates the payout record with a computed amount (members × contribution), but reviewed 05 M8 decided payout amount is 'entered by tr

**Issue:** §b pre-creates the payout record with a computed amount (members × contribution), but reviewed 05 M8 decided payout amount is 'entered by treasurer at claim time — app records reality, never computes/asserts an owed amount (also safer under R4/R7)'. Pre-filling a system-computed owed amount is exactly what M8 avoids.

**Fix applied:** Pre-create the payout record with amount unset (claim mutation requires treasurer-entered amount > 0); if a hint is wanted, show the sum of confirmed contributions at claim time labeled as an estimate, never stored as the obligation.

### [MINOR] Transition 4's guard allows the president to confirm on behalf of a hasAccount:false PAYER only, but 05 M8's feature-phone BENEFICIARY case 

**Issue:** Transition 4's guard allows the president to confirm on behalf of a hasAccount:false PAYER only, but 05 M8's feature-phone BENEFICIARY case (payout: treasurer claims payer-side, the confirming party is the payee) requires the president to act for a hasAccount:false payee. 05 already states the correct behavior ('president confirms on their behalf, logged as such — no deadlock') and Week 2 correctly says 'party'; 02's narrower wording leaves M8's promise without an implementable guard, and every feature-phone beneficiary payout would auto-dispute at T_AUTO_DISPUTE.

**Fix applied:** In 02 transition 4, change 'president acting for a hasAccount:false payer' to 'president acting for a hasAccount:false party (payer or payee)'.

### [MINOR] Payment-state validator name drift: 02's intro says `paymentRecordStatusValidator`, 01's schema exports `paymentStateValidator`, 05 Week 1 s

**Issue:** Payment-state validator name drift: 02's intro says `paymentRecordStatusValidator`, 01's schema exports `paymentStateValidator`, 05 Week 1 says `paymentRecordStateValidator`. Three names for one export.

**Fix applied:** Standardize on 01's actual export `paymentStateValidator` (the schema file is the artifact); update 02's intro line and 05 Week 1.

### [MINOR] §d's 'Add comment / attach proof → appended to record's immutable comment log' requires a comments table that 01 doesn't have, and 05 L1 exp

**Issue:** §d's 'Add comment / attach proof → appended to record's immutable comment log' requires a comments table that 01 doesn't have, and 05 L1 explicitly defers evidence threads beyond the basic flag to LATER.

**Fix applied:** Mark the comment-log row in 02 §d as L1 post-MVP (pilot path = the WhatsApp deep link in 03 B7), or — if comments are genuinely MVP — add a `disputeComments` table to 01 and promote it in 05. One tier.

## 03-screens-ux (42 issues)

### [BLOCKER] B6 Meeting Mode tick semantics contradict 02's locked PaymentRecord state machine. 03 says a tick creates the record 'directly in confirmed 

**Issue:** B6 Meeting Mode tick semantics contradict 02's locked PaymentRecord state machine. 03 says a tick creates the record 'directly in confirmed state', member's 'C'est exact ✓' is 'no state change', and 'Contester' goes confirmed → disputed — a transition that does not exist in 02 (the only exit from confirmed is president override → cancelled). 02 transition 3 + 05 M4 (already review-aligned) define the payee-side path as pending → claimed, starting T_AUTO_CONFIRM (48h); payer silence auto-confirms, 'Contester' is claimed → disputed (transition 6). As written, 03 deletes the payer's objection window on the killer feature and specs an impossible dispute path.

**Fix applied:** Rewrite B6 semantics: tick creates a payee-side claimed record (T_AUTO_CONFIRM 48h); 'C'est exact ✓' performs claimed → confirmed; silence auto-confirms (feed entry marked 'auto' per 02 transition 5); 'Contester' is claimed → disputed with mandatory reason. Update B3 grid and feed so meeting-mode entries show ⏳ déclaré until confirmed, and update the §E matrix row 'Meeting-mode cash logged' (currently says 'created confirmed').

### [BLOCKER] Custody optics: pot totals are displayed as bare balances with no custodian. Home hero 'Pot : 80 000 / 120 000 F', round detail 'Pot : 80 00

**Issue:** Custody optics: pot totals are displayed as bare balances with no custodian. Home hero 'Pot : 80 000 / 120 000 F', round detail 'Pot : 80 000 / 120 000 F', and Meeting Mode 'POT : 60 000 F' ticking up with a count-up animation are screenshot-readable as an app-held pooled balance — exactly the red line in 00 ('No balances implying the app holds value. No pooling.'). The custody disclaimer exists only on the pay/USSD screens; nothing on any pot surface says the money is physically with the treasurer.

**Fix applied:** Caption every pot/total display with the human custodian: home/round 'Pot : 80 000 / 120 000 F · reçu par Marie (trésorière)'; Meeting Mode 'ESPÈCES CHEZ MARIE : 60 000 F' (or 'reçu par la trésorière'); meeting summary 'Reçu par Marie 110 000 F'. Add a rule to §F: any aggregate amount must name who holds it. Cheap copy fix, clears the regulatory reading.

### [BLOCKER] B6 (and the §E matrix row 'Meeting-mode cash logged (created confirmed)') says a Meeting Mode tick 'creates a PaymentRecord… directly in con

**Issue:** B6 (and the §E matrix row 'Meeting-mode cash logged (created confirmed)') says a Meeting Mode tick 'creates a PaymentRecord… directly in confirmed state', with member buttons 'C'est exact' (no state change) and 'Contester' (→ disputed). This contradicts 02's canonical machine (payee-side claim → claimed with claimedBySide:'payee', auto-confirm at T_AUTO_CONFIRM=48h) and 05 M6/Week-4 ('batch-creates claimed PaymentRecords… auto-confirm on silence, per 02') — the alignment 00 says was already applied. Worse, 'Contester' from confirmed is an illegal transition in every doc (confirmed is ledger-final, exit = president override only), and the per-row ↩ undo would be confirmed→cancelled, also illegal. Also says the tick 'creates' a record when 02/01 pre-create pending records at round open — the roll-call list IS those records.

**Fix applied:** Rewrite B6 semantics: a tick transitions the round's pre-created pending record to claimed (claimedBySide:'payee', method cash); ✓ chip is local/optimistic; auto-confirms at T_AUTO_CONFIRM. 'C'est exact' = payer counter-ack (or early confirm short-circuiting the window); 'Contester' = claimed→disputed (legal). ↩ undo = claimant withdraws own claim (claimed→cancelled, system re-creates pending — legal per 02 row 8). Update the §E matrix row to 'created claimed (payee-side)'.

### [BLOCKER] No screen anywhere starts a cycle. The wizard (B9) ends at the invite step with the group in setup; B2 group detail is drawn only in its act

**Issue:** No screen anywhere starts a cycle. The wizard (B9) ends at the invite step with the group in setup; B2 group detail is drawn only in its active state with no 'Démarrer le cycle' CTA; between_cycles → next cycle has no UI either. B9 also says the order 'locks at first round start', contradicting 02 where lock is an explicit president action ('Démarrer le cycle') with guards (≥2 active members, every active member in order exactly once, treasurer assigned) that materializes all rounds. As specced, the core loop can never begin: rounds, pre-created pending records, and Meeting Mode all depend on cycle lock.

**Fix applied:** Add the setup-state and between_cycles-state variants of B2 group detail with a president-only 'Démarrer le cycle' CTA that runs 02's guards and shows the one-time lock-confirm sheet (this replaces B9's 'locks at first round start' wording). Wizard step 4 'Terminer' should land on this setup-state screen with 'X membres ajoutés — démarrez le cycle quand tout le monde a rejoint'.

### [MAJOR] B6 meeting summary folds fines into the beneficiary's pot: 'Reçu 110 000 (11/12) + Amendes 2 000 = Pot pour Mama Ngozi 112 000 F' (and payou

**Issue:** B6 meeting summary folds fines into the beneficiary's pot: 'Reçu 110 000 (11/12) + Amendes 2 000 = Pot pour Mama Ngozi 112 000 F' (and payout.confirmed copy '112 000 F'). In Cameroonian njangi practice, amendes go to the group's caisse/trouble fund, not the current tour's beneficiary; 02's treasurer-handover statement likewise accounts fines as group cash-on-hand separate from payouts. Every pilot treasurer's arithmetic will disagree with the app's summary.

**Fix applied:** Keep pot and fines separate: 'Pot remis à Mama Ngozi 110 000 F' + 'Caisse (amendes) 2 000 F' as distinct lines in the summary, WhatsApp share text, and payout.confirmed copy. Where fines go is a group rule — default to caisse, never auto-add to the payout amount.

### [MAJOR] Treasurer cannot record a payment from a member who never opens the app, outside Meeting Mode. Decision 7 says 'treasurer logs for them' and

**Issue:** Treasurer cannot record a payment from a member who never opens the app, outside Meeting Mode. Decision 7 says 'treasurer logs for them' and 02 transition 3 supports payee-side claims generally, but in 03 the only treasurer-logging surface is Meeting Mode; round detail shows '[✓ Reçu]' only on already-claimed rows. A member who sends MoMo mid-week and never claims (the most common low-literacy behavior, and kill-signal #2 'members don't open') is unrecordable until the réunion — so the treasurer keeps the paper notebook.

**Fix applied:** On B3 round detail, give the treasurer a 'Marquer reçu' action on pending rows → method picker (MoMo/OM/espèces) + amount → payee-side claimed with T_AUTO_CONFIRM, identical semantics to a Meeting Mode tick. Same action on fine rows.

### [MAJOR] §E notification matrix ships an 'SMS (premium)' column that does not exist in the MVP: 05 defers ALL SMS to L6 ('push + treasurer's voice co

**Issue:** §E notification matrix ships an 'SMS (premium)' column that does not exist in the MVP: 05 defers ALL SMS to L6 ('push + treasurer's voice covers the pilot'; the public feed is the feature-phone receipt until L6), and 04's cost model flags the SMS provider as unverified. B6 also states 'Feature-phone members get the SMS receipt only; their silence is acceptance' — a channel that won't be live during the pilot, leaving feature-phone members' MVP protection unspecified in the doc that defines the UX.

**Fix applied:** Mark the SMS column L6/post-MVP in §E. Spec the actual MVP fallback explicitly: feature-phone entries are payee-side claims with auto-confirm, the group feed + treasurer reading the meeting summary aloud + WhatsApp-forwarded summary are their receipt, and they are exempt from payer-side auto-dispute (per 05). Update B6's feature-phone sentence accordingly.

### [MAJOR] No UI anywhere for 02's OrderChange mechanism ('begging the turn' — president-only swap of two future beneficiaries with mandatory note, plu

**Issue:** No UI anywhere for 02's OrderChange mechanism ('begging the turn' — president-only swap of two future beneficiaries with mandatory note, plus exit-driven removals). B2 presents the order as immutably '🔒 fixé' ('L'ordre a été fixé le 3 mars… Tout le monde voit le même ordre') and group settings list only fines/schedule/invite/premium. Turn swaps for bereavements/emergencies are routine njangi practice; the first one in the pilot forces the group back to the notebook.

**Fix applied:** Add a president-only 'Échanger deux tours' action (Group Detail or settings) → pick two future turns → mandatory note → confirmation. Surface the OrderChange in the feed and as a marker in the rotation list ('ordre modifié le 12 juin par le président — voir la note'), preserving the locked-and-public trust property.

### [MAJOR] Fines are MVP (05 M14: treasurer logs member + amount + reason; 'Pilot promise fines respected depends on this') and 02 makes fine records o

**Issue:** Fines are MVP (05 M14: treasurer logs member + amount + reason; 'Pilot promise fines respected depends on this') and 02 makes fine records ordinary claim/confirm handshakes — but 03 has no fine-entry flow outside the Meeting Mode long-press, and no member-side flow to PAY a fine: the pay flow is hardwired to contributions under rounds/:roundId/pay ('Cotiser · Tour 4'), and B3's fine rows are read-only. B8 even shows 'Amende 500 F · ✓ payée' with no path that could have produced it.

**Fix applied:** (a) Add 'Ajouter une amende' for the treasurer/president from round detail and member profile (member + amount prefilled from settings + reason), per M14. (b) Make the pay/claim flow kind-aware so tapping one's own fine row launches the same method-picker → USSD → claim flow for kind: fine. Mark Assistance rows/sections as post-MVP per 05 ('kinds fine/assistance in schema now, UI later') or remove them from B3 until then.

### [MAJOR] Claim screen (B4 step 3) has no amount field — the amount is fixed in the header. 02 explicitly says 'Claim amount is prefilled with the obl

**Issue:** Claim screen (B4 step 3) has no amount field — the amount is fixed in the header. 02 explicitly says 'Claim amount is prefilled with the obligation amount but editable (reality: people send what they have)' with partial obligations, split records, and multiple records per (member, round) as normal. A market trader who sent 5 000 of 10 000 F cannot claim truthfully, and B3's grid has no partial-payment representation.

**Fix applied:** Add a prefilled, editable amount field to the claim screen (numeric keyboard, warn — don't block — on over/under per 02's guards). Show partials in the round grid ('5 000 / 10 000 F · partiel') and pin the remainder as an open arrears row per 02.

### [MAJOR] §E matrix is missing the private treasurer reminder ramp before the public 72h auto-dispute. 02 defines T_CONFIRM_REMIND_1/2 (24h/48h, trans

**Issue:** §E matrix is missing the private treasurer reminder ramp before the public 72h auto-dispute. 02 defines T_CONFIRM_REMIND_1/2 (24h/48h, transition 14) and 05 M12 lists 'confirmation pending' reminders, but 03 jumps from the instant 'claim logged' push straight to a group-visible dispute. Treasurers — the buyer (decision 5) and a figure of authority in njangi culture — get publicly flagged by the app for being busy, with zero private warning. Also missing: 02's daily-during-grace pings to pending payers (03 only has D-2/D-0).

**Fix applied:** Add matrix rows: T+24h and T+48h private push to the confirming party ('Rappel : confirmez 10 000 F d'Aïcha') per 02 transition 14, and daily-during-grace reminders to members still pending, per 02's round section. Keep the 72h escalation, but it must never be the treasurer's first signal.

### [MAJOR] Bottom-nav decision gates the group switcher on premium ('becomes group switcher list on premium multi-group'), conflating member multi-memb

**Issue:** Bottom-nav decision gates the group switcher on premium ('becomes group switcher list on premium multi-group'), conflating member multi-membership with treasurer-paid premium. Decision 8 makes premium per-group, paid by the treasurer — members never pay. Cameroonians routinely belong to 2–5 njangis; an invitee joining a second group via the champion funnel (decision 5) needs the Groupe tab to switch regardless of any group's premium status, and a join must never bounce off a '1 group' free limit applied to membership.

**Fix applied:** Show the group switcher whenever the user has >1 active membership, free or premium. State explicitly that the free-tier '1 group' limit applies to groups created/owned (treasurer side), and that joining via invite is never gated.

### [MAJOR] §D specifies an offline-first sync engine: a persistent localStorage outbound queue for claims, treasurer confirms, and dispute resolutions;

**Issue:** §D specifies an offline-first sync engine: a persistent localStorage outbound queue for claims, treasurer confirms, and dispute resolutions; versioned localStorage snapshots of query results rehydrated on boot; a separate image-upload retry queue. 05 Week 4 contains an explicit applied scope-guard DECISION: offline queue = Convex's built-in in-memory mutation queue + optimistic updates ONLY ('a persistent offline-first store alone busts the 4–6 week window'), and 04 §D adds exactly one compromise — a localStorage journal for Meeting Mode ticks. Three docs now disagree, and 03's version is the one a solo dev cannot build in the window.

**Fix applied:** Scope §D down to: Convex in-memory queue + optimistic updates + connectivity banner for everything, plus the Meeting-Mode-only localStorage tick journal per 04 §D (idempotency keys per 05 Week 2 make replays safe), plus precached static USSD content. Demote the general persistent mutation queue, snapshot rehydration, and offline image retry queue to LATER explicitly.

### [MAJOR] §E ships SMS in the MVP matrix ('SMS (premium groups only)') and B6 relies on it: 'Feature-phone members get the SMS receipt only; their sil

**Issue:** §E ships SMS in the MVP matrix ('SMS (premium groups only)') and B6 relies on it: 'Feature-phone members get the SMS receipt only; their silence is acceptance.' 05 demotes ALL SMS (reminders AND feature-phone receipts) to L6, and pilot groups get premium free — so as written, a feature-phone member's cash entry auto-confirms at 48h with the member receiving no notification of any kind. That's the silent-auto-confirm trap on the population least able to object.

**Fix applied:** Mark the entire SMS column as L6/post-pilot. Everywhere 03 references SMS receipts (B6, §E), state the MVP fallback per 05 Week 4: the public feed + treasurer's read-out/WhatsApp-forwarded meeting summary is the feature-phone receipt, and these entries are payee-side by construction (no payer-side auto-dispute risk).

### [MAJOR] B5 declares the member view of the inbox 'read-only' ('Mes paiements en cours: their own claimed/disputed records, read-only'). But payee-si

**Issue:** B5 declares the member view of the inbox 'read-only' ('Mes paiements en cours: their own claimed/disputed records, read-only'). But payee-side claims (Meeting Mode) give the payer an objection window whose only specified surface is a push notification — and 05 M12 makes the in-app inbox the guaranteed channel precisely because push is unreliable (permission denials, iOS PWA install requirement). A member whose cash was mis-logged has no in-app way to hit 'Contester' before auto-confirm.

**Fix applied:** Member inbox lists their payee-side claimed records with 'C'est exact ✓' / 'Contester' actions, and /app/payments/:pid in claimed state renders the same buttons for the payer. Keep payer-side claimed records ('waiting on Marie') read-only.

### [MAJOR] B3 and B5 specify confirm as 'optimistic' with a '5s undo snackbar'. Undoing a fired confirm is confirmed→(anything), which no state machine

**Issue:** B3 and B5 specify confirm as 'optimistic' with a '5s undo snackbar'. Undoing a fired confirm is confirmed→(anything), which no state machine allows — confirmed is ledger-final with president override as the only exit (01 §3.2, 02). As written, devs will either implement an illegal un-confirm or silently drop the undo.

**Fix applied:** Define undo mechanically: the confirm mutation is dispatched after a 5s client-side grace window (row shows '✓ confirmation…' meanwhile); undo within the window cancels the dispatch, nothing hits the ledger. Or drop undo and rely on president override for fat-fingers. Say which.

### [MAJOR] B7 says 'No third-party arbitration in MVP' and offers only two resolutions (payee late-confirms, payer withdraws). 02 rows 11–12 and 05 M9 

**Issue:** B7 says 'No third-party arbitration in MVP' and offers only two resolutions (payee late-confirms, payer withdraws). 02 rows 11–12 and 05 M9 both put president override (mandatory note, immutable override record) in MVP — part of the fixes 00 says were applied ('disputed exits'). Without it, a standoff (payer insists sent, payee insists not received) is an absorbing state: T_DISPUTE_STALE pings the president weekly to 'tranchez' but the screen gives the president no action.

**Fix applied:** Add a president-only 'Trancher' action on B7: choose 'Finalement reçu' (→confirmed) or 'Annuler la déclaration' (→cancelled), mandatory note ≥10 chars, badge 'résolu par le président' (plus '(partie au litige)' when applicable, per 02 row 11).

### [MAJOR] B10's invite path is 'Rejoindre → Clerk → auto-join → lands on group detail'. 02 has an explicit DECISION that invite-code joins create Memb

**Issue:** B10's invite path is 'Rejoindre → Clerk → auto-join → lands on group detail'. 02 has an explicit DECISION that invite-code joins create Membership in pending_approval and president/treasurer must approve — 'an open link must not auto-admit' (njangis are closed trust circles). Auto-join is only correct for invitees pre-added by phone in wizard step 3 (existing active membership gets linked).

**Fix applied:** Split the join flow: phone matches a pre-added membership → auto-attach and land on group detail; otherwise → 'Demande envoyée — le président doit vous approuver' waiting state, plus an approval queue entry for president/treasurer (currently no screen surfaces pending_approval requests — add to B2 settings or inbox).

### [MAJOR] The president/treasurer admin surfaces required by 02 §e and in MVP scope per 05 M3/M8 have no screens: (a) mark member exited/deceased with

**Issue:** The president/treasurer admin surfaces required by 02 §e and in MVP scope per 05 M3/M8 have no screens: (a) mark member exited/deceased with mandatory note (B8 member profile has no admin actions; B2's settings parenthetical omits member management and role reassignment even though B9 says roles are reassignable in settings); (b) 'defaulting' badge after 2 consecutive unpaid rounds + the president prompt to keep/remove; (c) arrears: no 'doit {total}' display on group detail or member profile, and no way to claim an arrears record after its round closes — the pay flow is round-scoped and the home CTA moves to the next round, so 02's 'claimable weeks later' arrears are unreachable.

**Fix applied:** Add: president action sheet on B8 (exit/decease/remove with note, OrderChange swap of future turns); defaulting badge + prompt; an 'Impayés' block on B2 and a 'doit' line on B8 with 'Je cotise' wired to the open arrears pending record (closed rounds keep their pay entry point for arrears rows).

### [MAJOR] The claim screen (B4 step 3) has no amount field — '10 000 F' is fixed in the header. 02 edge case 7 (canon) makes claim amount prefilled-bu

**Issue:** The claim screen (B4 step 3) has no amount field — '10 000 F' is fixed in the header. 02 edge case 7 (canon) makes claim amount prefilled-but-editable ('people send what they have'), with the obligation satisfied by the sum of confirmed records and shortfalls split into arrears. As specced, a member who sent 5 000 F can only claim 10 000 F, guaranteeing a wrong ledger entry and a dispute in week one of the pilot.

**Fix applied:** Add an editable amount field (prefilled with remaining obligation) to the claim screen, show 'reste 5 000 F' on the member's round row after a partial confirm, and warn (not block) when claiming against an already-satisfied obligation per 02 edge case 6.

### [MAJOR] Feature-phone beneficiary deadlock: the payout claim ('Marquer le payout remis', B3/B6) is payer-side (treasurer), so per 02 it auto-DISPUTE

**Issue:** Feature-phone beneficiary deadlock: the payout claim ('Marquer le payout remis', B3/B6) is payer-side (treasurer), so per 02 it auto-DISPUTES at T_AUTO_DISPUTE if the payee stays silent — and a feature-phone beneficiary can never confirm in-app. Every round whose beneficiary has no smartphone ends in an auto-disputed payout and a round stuck in payout state. 05 M8 already prescribes the fix ('president confirms on their behalf, logged as such, feed-labeled attesté — no deadlock') but 03 never surfaces it.

**Fix applied:** Add the president confirm-on-behalf affordance on the payout record for hasAccount:false beneficiaries, feed-labeled 'attesté par le président pour {name}', reachable from B3's payout block and the B6 meeting summary.

### [MAJOR] Meeting Mode (B6) only defines un-ticked vs ticked rows. A member who self-claimed MoMo before the réunion has a record in claimed state; 't

**Issue:** Meeting Mode (B6) only defines un-ticked vs ticked rows. A member who self-claimed MoMo before the réunion has a record in claimed state; 'tap anywhere on row = cash received' on that row creates/claims a second record and double-counts the pot (10 000 F obligation showing 20 000 F). Mixed self-claim + roll-call is the normal case per decision 3, and it will happen at the first pilot meeting. Disputed rows are also undefined.

**Fix applied:** Specify row rendering per state: claimed rows show '⏳ déclaré (MoMo)' and tap = confirm the existing record (claimed→confirmed); confirmed rows pre-ticked; disputed rows deep-link to the dispute screen; only pending rows get the tap-=-cash behavior.

### [MAJOR] B8 ReliabilityScore is triply inconsistent: (a) claims '3 bands, thresholds defined in the data-model section' — 01 §4 defines FOUR differen

**Issue:** B8 ReliabilityScore is triply inconsistent: (a) claims '3 bands, thresholds defined in the data-model section' — 01 §4 defines FOUR different buckets (Excellent/Fiable/Moyen/À risque), so the pointer is false; (b) the header sells cross-group portability ('Le score suit Mama Ngozi dans tous ses njangis', Member-level stats across all groups) but 05 demotes portability to L4 (M13 = per-group on-time % only); (c) 04's privacy rules say same-group members see only the in-group rate — cross-group aggregates require explicit consent — so the screen as drawn violates the consent model.

**Fix applied:** MVP B8 shows the in-group v1 score (on-time % per M13) with one bucket set reconciled with 01 (pick 3 or 4 bands once, in one doc); move the portability header + 'ℹ Le score suit…' explainer and the profile.scoreExplainer copy string to a LATER note tied to L4 and 04's scoreShareConsents flow.

### [MAJOR] Same Meeting-Mode fork as 01: B6 DECISION says a tick creates the record 'directly in `confirmed` state' with the member's buttons being a n

**Issue:** Same Meeting-Mode fork as 01: B6 DECISION says a tick creates the record 'directly in `confirmed` state' with the member's buttons being a no-op acknowledge or dispute, and the §E matrix row reads 'Meeting-mode cash logged (created `confirmed`)'. 02 transition 3 (and 05 M6/M9/Week 4) make the tick a payee-side `claimed` with a 48h objection window auto-confirming on silence.

**Fix applied:** Rewrite B6's semantics DECISION: tick = payee-side claim (state `claimed`, `claimedBySide='payee'`); member's `C'est exact ✓` performs the real `claimed → confirmed`; silence auto-confirms at `T_AUTO_CONFIRM` (48h). Update the §E matrix row to 'Meeting-mode cash logged (payee-side claim, auto-confirms 48h)'.

### [MAJOR] B10 invite path: '`Rejoindre` → Clerk → auto-join → lands on group detail'. 02's invites DECISION is the opposite: joining via code creates 

**Issue:** B10 invite path: '`Rejoindre` → Clerk → auto-join → lands on group detail'. 02's invites DECISION is the opposite: joining via code creates a `pending_approval` Membership and 'president or treasurer must approve' before the member is active ('an open link must not auto-admit'). Auto-join would also expose the full group ledger to an unapproved stranger.

**Fix applied:** In B10, insert a pending-approval state after sign-up: a waiting screen (« Demande envoyée à {presidentName} — vous serez notifié ») showing only the public preview data; landing on group detail happens after the approval push (per 02). Keep the B9-step-3 exception: members pre-added by the creator are matched by phone and become active immediately.

### [MAJOR] Offline persistence contradicts reviewed 05. 03 §D DECISIONs promise a localStorage outbound mutation queue + localStorage snapshot rehydrat

**Issue:** Offline persistence contradicts reviewed 05. 03 §D DECISIONs promise a localStorage outbound mutation queue + localStorage snapshot rehydration ('flushed on online', survives app kill), and 04 §D promises a localStorage journal for Meeting Mode ticks 'replayed on next app open'. 05 Week 4's scope-guard DECISION explicitly rules this out: offline queue = Convex's in-memory queue + optimistic updates ONLY, 'taps lost if app killed before sync', mitigated by a visible pending counter — because a persistent store 'busts the 4–6 week window'.

**Fix applied:** Align 03 §D and 04 §D to 05's scope guard: in-memory queue + « N en attente de synchro » counter for the pilot; keep the read-side localStorage snapshot of essential specs (cheap, read-only) if desired but mark the write-side localStorage queue/journal as post-pilot hardening. If the durable journal is deemed essential for Meeting Mode credibility, promote it in 05 instead — but make the three docs say one thing.

### [MINOR] 'Payout' anglicism leaks into French UI, violating §F's own locked term map (Payout → 'le pot / remise du pot'): B3 section header 'Payout ·

**Issue:** 'Payout' anglicism leaks into French UI, violating §F's own locked term map (Payout → 'le pot / remise du pot'): B3 section header 'Payout · Mama Ngozi' and B6 button '[ Marquer le payout remis ]'. Meaningless jargon for a 45-year-old trader. Separately, §F's mapping disagrees with 04's glossary (Payout = 'versement au bénéficiaire').

**Fix applied:** Use 'Remise du pot' / 'Marquer le pot remis' on all FR surfaces; reconcile §F's term map with 04's glossary in the same edit (pick one canonical FR term for payout).

### [MINOR] B3 payout block copy '○ en attente du pot complet' implies the payout is blocked until the pot is complete — pots are routinely handed over 

**Issue:** B3 payout block copy '○ en attente du pot complet' implies the payout is blocked until the pot is complete — pots are routinely handed over incomplete (B6 itself hands 112 000 F at 11/12, with arrears outstanding). Also, 02 supports the stronger beneficiary-side claim ('j'ai reçu' → payee-side, auto-confirms) but 03 only wires treasurer-claims-then-beneficiary-confirms.

**Fix applied:** Change copy to '○ pas encore remis'; allow the treasurer to claim the payout at any time. Add a beneficiary-facing 'J'ai reçu le pot' button on round detail mapping to 02's payee-side payout claim.

### [MINOR] tel:*126%23 as the primary USSD button is unreliable on the exact reference devices: many Android OEM dialers and WebViews strip * / # from 

**Issue:** tel:*126%23 as the primary USSD button is unreliable on the exact reference devices: many Android OEM dialers and WebViews strip * / # from web-originated tel: URIs (post-2012 USSD-exploit hardening), and Tecno/Itel dialers vary. Nearly all Cameroonian users are dual-SIM (MTN + Orange), and the code must be dialed on the matching SIM — the doc never mentions SIM choice.

**Fix applied:** Treat the dial button as progressive enhancement with a visible 'Copier le code *126#' fallback; add 'sur votre SIM MTN' / 'sur votre SIM Orange' to step 1 of both §C flows; add the dial button to the §G reference-device smoke-test checklist.

### [MINOR] 02's defaulting/arrears machinery is invisible in 03: memberships badged 'defaulting' should appear 'on every group screen', and unpaid fine

**Issue:** 02's defaulting/arrears machinery is invisible in 03: memberships badged 'defaulting' should appear 'on every group screen', and unpaid fines/arrears feed a member's 'doit' total — but B2's rotation list, B3's grid, and B8's member profile show none of it. Arrears visibility is core social enforcement in njangis.

**Fix applied:** Add a 'défaillant' badge to member rows (B2/B3) and a 'Doit : X F' line (open arrears + unpaid fines) to the B8 in-group section, consistent with the warn-without-shaming copy rule.

### [MINOR] The bottom-nav 'Groupe' tab and the single hero pulse card assume exactly one group per user, with a switcher gated to 'premium multi-group'

**Issue:** The bottom-nav 'Groupe' tab and the single hero pulse card assume exactly one group per user, with a switcher gated to 'premium multi-group'. But the free-tier limit is on group CREATION (01: counted on creator memberships), not membership — belonging to several njangis is normal in Cameroon and possible in the pilot. 'Active group' is never defined.

**Fix applied:** Define active group (e.g. last-viewed, persisted); show the group list/switcher and stacked pulse cards whenever the user has >1 active membership, regardless of tier. Keep premium gating on creating/owning multiple groups only.

### [MINOR] B3's payout chip '○ en attente du pot complet' implies the payout is gated on a full pot; 02 explicitly lets the treasurer claim the payout 

**Issue:** B3's payout chip '○ en attente du pot complet' implies the payout is gated on a full pot; 02 explicitly lets the treasurer claim the payout any time from round open ('the app must not force a 2-day wait') and 05 M8 allows closing with a shortfall. Also B6's computed 'Pot pour Mama Ngozi 112 000 F' sits in tension with M8's rule that the payout amount is entered by the treasurer and the app 'never computes/asserts an owed amount' (R4/R7 framing).

**Fix applied:** Change the chip to '○ pas encore remis' with the treasurer's claim CTA available from open; label computed totals as confirmed-record sums ('Total confirmé') per 04 rule 3, and make the B6 summary's payout figure the prefill of an editable treasurer-entered amount.

### [MINOR] Self-party handshakes are unaddressed: the treasurer's own contribution (payer = payee = treasurer) and the round where the treasurer is the

**Issue:** Self-party handshakes are unaddressed: the treasurer's own contribution (payer = payee = treasurer) and the round where the treasurer is the beneficiary (payout payer = payee) collapse the two-sided handshake into self-confirmation. As drawn, the UI would show the treasurer 'en attente de confirmation' from themself, and the inbox would ask them to confirm their own claim. This happens at least once per cycle in every group.

**Fix applied:** State the behavior: self-party records confirm immediately on claim, feed-labeled 'auto-confirmé — trésorier' (the group-visible label is the control, per 02's president-is-a-party precedent), and are excluded from the inbox.

### [MINOR] B3 includes an 'Assistance (0) ▸' section inside Round detail and §F locks assistance copy, but 05 demotes AssistanceLevy flows to L3 (LATER

**Issue:** B3 includes an 'Assistance (0) ▸' section inside Round detail and §F locks assistance copy, but 05 demotes AssistanceLevy flows to L3 (LATER), and levies are round-independent (02 §f; 01 I-5: assistance records carry assistanceLevyId, no roundId).

**Fix applied:** Drop the Assistance section from Round detail; when L3 ships, surface levies at group level (group detail or feed). Mark the §F 'assistance' term as reserved for LATER.

### [MINOR] /join/:inviteCode — the main acquisition funnel — has no state for a join rejected at the 40-member cap (05 Week 6: 'creation/joins rejected

**Issue:** /join/:inviteCode — the main acquisition funnel — has no state for a join rejected at the 40-member cap (05 Week 6: 'creation/joins rejected above cap'), so a WhatsApp invitee at member 41 hits an unspecified error. Also the route is /join/:code while 02 specifies the short link format /j/:code; the WhatsApp message and the route tree should agree.

**Fix applied:** Add a friendly 'Ce groupe est complet (40 membres)' state to the join screen with 'Contactez {president}'; pick one link format (/j/:code is shorter for WhatsApp) and update the route tree or 02 to match.

### [MINOR] Timer constants drift: B7 says '72h — configurable per group later', 02 says fixed app-wide T_AUTO_DISPUTE=72h, 05 Week 2 says 3 days for co

**Issue:** Timer constants drift: B7 says '72h — configurable per group later', 02 says fixed app-wide T_AUTO_DISPUTE=72h, 05 Week 2 says 3 days for contributions and 7 for payouts, 01 has per-group confirmationWindowDays defaulting to 3. 03 never states the payout auto-dispute window its payout UI depends on.

**Fix applied:** Reference 02's constants table as the single source in B7, and state the payout window explicitly (reconcile 02's 72h with 05's 7-day payout DECISION in whichever doc wins — then cite it).

### [MINOR] Treasurer replacement (02 §e5) has no UX trace: the B2 settings list omits role reassignment (B9 says it lives there), the handover-statemen

**Issue:** Treasurer replacement (02 §e5) has no UX trace: the B2 settings list omits role reassignment (B9 says it lives there), the handover-statement screen referenced by 02/05 R2 is absent from the route tree, and the offline-cached USSD screen ('static content + already-loaded treasurer number') would keep instructing members to send MoMo to the ex-treasurer's number after a handover — possibly someone removed for cause.

**Fix applied:** Add role reassignment + handover statement to the settings screen spec; on the USSD screen, revalidate the payee number when online and render the offline staleness pill directly on the number field ('Numéro vérifié le {date}'), not just globally.

### [MINOR] The 'Composer *126#' button is a tel:*126%23 link (03 line 230; 04 commandment 5 codifies the same form). Many Android dialers and browsers 

**Issue:** The 'Composer *126#' button is a tel:*126%23 link (03 line 230; 04 commandment 5 codifies the same form). Many Android dialers and browsers strip or reject '#' in tel: URIs as USSD protection, so on common cheap devices the dialer opens with '*126' (which does nothing when called) or the tap fails silently — confusing for the 45-year-old trader the flow is designed for. 04's regulatory rule is correct; the reliability of the link itself is unverified.

**Fix applied:** Add a week-1 RESEARCH FLAG to device-test tel:-USSD behavior on the Transsion devices dominant in Douala; if '#' is stripped, fall back to copy-only ('Composez *126# vous-même sur votre téléphone') with the code as a copy-tap field, keeping 04's bare-code rule untouched.

### [MINOR] Notification matrix (§E) is missing events 02 mandates: confirm reminders at 24h/48h (`T_CONFIRM_REMIND_1/2`, transition 14), the auto-confi

**Issue:** Notification matrix (§E) is missing events 02 mandates: confirm reminders at 24h/48h (`T_CONFIRM_REMIND_1/2`, transition 14), the auto-confirm notice (« confirmé automatiquement », transition 5), the `T_DISPUTE_STALE` weekly president escalation (§d), daily-during-grace reminders to still-pending members (§b), and the defaulting-member prompt to the president (§e1).

**Fix applied:** Add five rows to §E's matrix mirroring 02's transition-table 'Notifications fired' column (the auto-confirm row also depends on fixing B6's Meeting-Mode semantics).

### [MINOR] Payout semantics wording deviates from 02 in three places: B3 says 'When payout confirms, round auto-closes' (02: payout confirmation → `com

**Issue:** Payout semantics wording deviates from 02 in three places: B3 says 'When payout confirms, round auto-closes' (02: payout confirmation → `completed`; `closed` happens earlier at `graceEndAt`); B3's payout block shows « en attente du pot complet » (02: the payout handshake runs in parallel from `open` — never gated on a complete pot); B6 says 'Marquer le payout remis CREATES the payout PaymentRecord' (02 §b: the payout record is pre-created `pending` at round open; the button transitions it to `claimed`).

**Fix applied:** Rephrase B3/B6: payout record pre-exists from round open and is claimable any time; confirming it moves the round to `completed` (not 'closed'); replace « en attente du pot complet » with a neutral payout-status chip.

### [MINOR] Score display bands contradict 01: B8 specs '3 bands' labeled `Fiable / Correct / À surveiller` and claims 'thresholds defined in the data-m

**Issue:** Score display bands contradict 01: B8 specs '3 bands' labeled `Fiable / Correct / À surveiller` and claims 'thresholds defined in the data-model section' — but 01 §4 defines FOUR buckets with different labels (≥90 « Excellent », 70–89 « Fiable », 50–69 « Moyen », <50 « À risque »). B8's example '96 · Fiable' renders as « Excellent » under 01.

**Fix applied:** Change B8 to 01 §4's four buckets and labels (the example becomes « 96 · Excellent »), and drop the '3 bands' DECISION note.

### [MINOR] Rotation-lock timing drift: B9 step 3 says 'order locks at first round start (president can reorder future turns until then)'; 02 says lock 

**Issue:** Rotation-lock timing drift: B9 step 3 says 'order locks at first round start (president can reorder future turns until then)'; 02 says lock happens at cycle start ('Démarrer le cycle' materializes all rounds) and any post-lock change requires an immutable OrderChange record.

**Fix applied:** Change B9: the wizard's `Fixer l'ordre` is a draft; the order locks when the president taps « Démarrer le cycle » (02's guards apply); after that, reordering future turns goes through the OrderChange flow, not free editing.

## 04-non-functional (30 issues)

### [BLOCKER] §D Meeting Mode durability DECISION breaks the core ledger loop and contradicts the reviewed plan. The idempotency key (`roundId`, `payerMem

**Issue:** §D Meeting Mode durability DECISION breaks the core ledger loop and contradicts the reviewed plan. The idempotency key (`roundId`, `payerMembershipId`, `kind`) makes a legitimate SECOND payment by the same member in the same round (partial top-up, per 02 edge case #7 and 05 Week 4) indistinguishable from a replayed offline tap — the replay-dedupe silently drops real cash entries; it also collapses two distinct fines for the same member/round. 'Check-existing-before-insert' is incoherent with the pre-created `pending` records decision (01/02/05): a matching row ALWAYS exists, so the rule as written would no-op even the first real tick. Finally, the persistent localStorage journal directly contradicts 05 Week 4's scope-guard DECISION ('offline queue = Convex in-memory mutation queue + optimistic updates ONLY... NOT a persistent offline-first store — that alone busts the 4–6 week window') and 05 Week 2's idempotency DECISION (client-generated UUID per tap, `by_idempotency_key` index).

**Fix applied:** Rewrite the Meeting Mode durability paragraph to adopt 05's already-reviewed decisions: (1) idempotency = client-generated UUID per claim/tap stored on the paymentRecord with a `by_idempotency_key` index — partial/second payments get their own UUID and are never deduped; ticks against the pre-created pending record are state transitions (claim/confirm), which are already idempotent no-ops when in target state; (2) offline = Convex in-memory queue + `withOptimisticUpdate` + a visible 'N en attente de synchro' counter, per 05 Week 4. If the localStorage journal is kept at all, demote it to LATER, and spec it as storing {tapUUID, targetPendingRecordId, amount} with replay keyed on the UUID — never on (round, payer, kind).

### [MAJOR] Role matrix says only treasurer/president can 'See other members' phone numbers', and §B states returns validators expose phones only 'where

**Issue:** Role matrix says only treasurer/president can 'See other members' phone numbers', and §B states returns validators expose phones only 'where the role matrix permits'. But the core pay flow (03 §C USSD screen) must show the treasurer's MoMo number ('Numéro de Marie' + Copier) to every paying member — MoMo wallet-to-wallet payment is impossible without the payee's number. A faithful implementation of 04's matrix strips the number from the round query and breaks the #1 flow; the likely ad-hoc fix (expose all phones) would be a privacy regression. 03 line 628 ('member lists project name/phone/status') already drifts toward the regression.

**Fix applied:** Amend the role matrix: every member sees the phone numbers of their payment counterparties and group officers (treasurer + president); full member-roster phone visibility stays treasurer/president-only. State explicitly that the round/pay query's returns shape includes the payee (treasurer) number for active members.

### [MAJOR] Role matrix makes 'add/remove members' president-only. 02 says 'president or treasurer must approve' invite-code joins and 'treasurer/presid

**Issue:** Role matrix makes 'add/remove members' president-only. 02 says 'president or treasurer must approve' invite-code joins and 'treasurer/president adds [feature-phone members] directly'. Locked decision 5 makes the treasurer the champion who onboards 15–30 members; in real njangis the trésorier/secretary does roster work while the president arbitrates. As written, the access-control helpers built from this matrix would block the primary onboarding path.

**Fix applied:** Align the matrix with 02: approve pending joins and add (incl. feature-phone) members = treasurer AND president; remove member / mark exited-deceased stays president-only (matches 02's mandatory-note removal flow).

### [MAJOR] §D: 'treasurer-logged cash Contributions for feature-phone members auto-finalize 72h after the SMS receipt'. Conflicts with 02 (T_AUTO_CONFI

**Issue:** §D: 'treasurer-logged cash Contributions for feature-phone members auto-finalize 72h after the SMS receipt'. Conflicts with 02 (T_AUTO_CONFIRM = 48h, anchored at claim time, for all payee-side claims) and anchors finalization on an SMS that frequently never exists: 03 §E premium-gates ALL SMS and 05 defers SMS to L6 ('the public feed is their receipt' in pilot). Two different objection windows for the same flow, and an undefined anchor when no SMS is sent, hits exactly the low-literacy feature-phone segment: a member who objects on day 3 finds the record already final. Also the SMS template ('contactez votre trésorier ou président avant le JJ/MM') gives no phone number — useless on a feature phone — and routes objections to the treasurer, who is the party whose entry may be wrong; 02's template correctly includes {presidentPhone}.

**Fix applied:** Anchor auto-finalize at claim time per 02's T_AUTO_CONFIRM (48h), independent of SMS delivery; SMS receipt (when premium/L6) is a courtesy notification, not the clock. Replace the template with 02's: include the president's actual phone number and the concrete deadline date.

### [MAJOR] §C ghost-member mitigation ('treasurer-logged entries trigger an SMS receipt to that number — a ghost's SMS reaches a stranger or fails') de

**Issue:** §C ghost-member mitigation ('treasurer-logged entries trigger an SMS receipt to that number — a ghost's SMS reaches a stranger or fails') depends on SMS receipts that are premium-gated (03 §E) and deferred to L6 (05). During the MVP pilot — exactly when reputation/ghost farming would start — the headline mitigation is inert, and since no feature-phone member can ever be SMS-verified in MVP, 'non vérifié' badges apply to the entire feature-phone segment indiscriminately.

**Fix applied:** Rewrite the mitigation row to lead with mechanisms that work in MVP: phone-number uniqueness across a group's memberships, score thresholds (≥8 members, completed cycle), Clerk sign-up on that number = verified (free path), and group-visible ledger. Mark SMS-receipt detection explicitly as post-L6/premium hardening, and define 'vérifié' as 'this phone number has authenticated via Clerk OTP'.

### [MAJOR] §D Meeting Mode durability: 'logCashContribution is keyed on (roundId, payerMembershipId, kind) — check-existing-before-insert, so replays a

**Issue:** §D Meeting Mode durability: 'logCashContribution is keyed on (roundId, payerMembershipId, kind) — check-existing-before-insert, so replays are no-ops'. This contradicts 02 edge case 7 ('Multiple PaymentRecords per (member, round) are normal' — partial payments split obligations) and 05's already-applied review fix (partial payment 'recorded with actual amount + own idempotency key'). With the triple key, the localStorage replay journal silently drops a legitimate second entry — e.g. member sent 5,000 F by MoMo earlier and hands the remaining 5,000 F cash at the réunion — losing real money records in the critical offline path. It also describes inserts, while 02/05 design Meeting Mode ticks as transitions on the round's pre-created pending records.

**Fix applied:** Journal entries carry the pre-created PaymentRecord id when ticking an existing pending obligation (transition is naturally idempotent on record id + target state), and a client-generated UUID idempotency key for additional/partial entries — matching 05's per-entry key. Drop the (roundId, payerMembershipId, kind) dedup.

### [MAJOR] §F 'Treasurer entry rate' kill metric is defined as '% of due Rounds where the TREASURER logged ≥80% of expected Contributions within 48h'. 

**Issue:** §F 'Treasurer entry rate' kill metric is defined as '% of due Rounds where the TREASURER logged ≥80% of expected Contributions within 48h'. In MoMo-heavy groups (and for diaspora/busy members — normal njangi practice), members self-claim payer-side and the treasurer merely confirms, so treasurer-logged count ≈ 0 and a perfectly healthy group trips the '<60% for 2 Rounds' kill signal. Since 05's persevere/kill decision is driven by these metrics, the misdefinition could kill a working product, or mask the real signal in cash-réunion groups.

**Fix applied:** Redefine the metric as % of expected Contributions reaching `claimed` or `confirmed` within 48h of the Round date regardless of which side logged; track treasurer-logged vs member-self-logged share as a separate diagnostic column so 'treasurers won't do data entry' is still observable for cash groups.

### [MAJOR] §D and §C build MVP behavior on SMS that 05 demotes to LATER (L6) and 01 explicitly excludes from the schema. (a) The auto-finalize DECISION

**Issue:** §D and §C build MVP behavior on SMS that 05 demotes to LATER (L6) and 01 explicitly excludes from the schema. (a) The auto-finalize DECISION ('treasurer-logged cash Contributions for feature-phone members auto-finalize 72h after the SMS receipt') is unexecutable in MVP — no SMS receipt is ever sent — and contradicts both 02 (`T_AUTO_CONFIRM` = 48h measured from the claim) and 05 Week 4 (feature-phone entries auto-confirm via T_AUTO_CONFIRM; 'SMS receipt is L6 — until then the public feed is their receipt'). Three different specs for the same timer. (b) The ghost-member mitigation in §C (SMS receipt reaches a stranger or fails; delivery failures surfaced to president) does not exist without SMS. (c) The `smsOutbox` table + cron retry contradicts 01 §5, which deliberately excludes an SMS outbox/log table from the MVP schema.

**Fix applied:** Mark all of §D's 'SMS fallback architecture' (provider adapter, smsOutbox, retry cron, provider research flags) as L6 design-ahead, not MVP build items. State the MVP feature-phone path explicitly: payee-side claim → auto-confirm at `T_AUTO_CONFIRM` (48h from claim, one constant, per 02/05); delete the 72h-after-SMS variant or re-spec it as the L6 enhancement (and if 72h is wanted then, change `T_AUTO_CONFIRM` in 02 once, not here). Annotate the ghost-member mitigation as L6-dependent, with the MVP fallback being in-person pilot onboarding (the dev enters members at the réunion per 05 §C). When L6 ships, amend 01 §5 to admit the smsOutbox table — the two docs currently contradict each other.

### [MAJOR] §C treasurer-absconds mitigation ('a Round whose Contributions are confirmed but whose Payout stays unconfirmed past X days is auto-flagged 

**Issue:** §C treasurer-absconds mitigation ('a Round whose Contributions are confirmed but whose Payout stays unconfirmed past X days is auto-flagged Disputed to the whole Group') is unimplementable against 02's state machine. An absconding treasurer simply never CLAIMS the payout, so the payout record stays `pending` forever; no timer runs on `pending` (T_AUTO_DISPUTE applies only to `claimed` payer-side records), there is no `pending → disputed` transition in any doc, and 'X days' is undefined. The exact abuse case this row claims to mitigate is the one the mechanism cannot detect.

**Fix applied:** Spec the real mechanism: a cron rule on rounds, not paymentRecords — any round in `payout` state (or closed with its payout record still `pending`/`claimed`) N days after `graceEndAt` (suggest N = 7, matching 05 Week 2's payout X) triggers a group-visible feed flag + push to all members ('Versement non confirmé — round {n}'). Do not say 'auto-flagged Disputed' for a pending record — either the treasurer claims first (then the existing claimed-payout auto-dispute applies) or this is a round-level alert, not a PaymentRecord state. Add the corresponding timer row to 02 §(b) so the round lifecycle owns it.

### [MAJOR] §B cross-group ReliabilityScore sharing (the `scoreShareConsents` table, opt-in/revocation flow, and the aggregate display '97% à temps, 3 c

**Issue:** §B cross-group ReliabilityScore sharing (the `scoreShareConsents` table, opt-in/revocation flow, and the aggregate display '97% à temps, 3 cycles complétés, 2 groupes') plus §C's score-gating thresholds (count only groups ≥ 8 members with ≥ 1 completed cycle; account-age weighting) are (a) scope creep — 05 demotes cross-group portability to L4 ('impossible before month 2') and M13's v1 score is an in-group dumb ratio, where collusion gating is pointless because the group already sees its own ledger; and (b) unsupported by 01's schema — `reliabilityStats` stores only aggregate per-user counters with no per-group, per-cycle, or group-size dimension, so the ≥8-member/≥1-cycle filter and the 'cycles complétés, N groupes' aggregate cannot be computed at read time. The section also contradicts §B's own claim that 'there is no cross-group read path.'

**Fix applied:** Mark the entire cross-group block (consent flow, scoreShareConsents, gating thresholds, badging 'non vérifié' in cross-group displays) as L4 design-ahead. State the MVP rule in one line: score visible in-group only (matches M13 and the launch-checklist counsel fallback), which makes 'no cross-group read path' true. Add a note that v2 requires per-membership/per-group stat rows (a schema addition to 01) before the eligibility gates are implementable — do not leave the thresholds looking like enforceable MVP mitigations.

### [MAJOR] §B role matrix contradicts 02 and 05 in cells that would be implemented as `requireRole` checks. (a) 'Add/remove members' is president-only,

**Issue:** §B role matrix contradicts 02 and 05 in cells that would be implemented as `requireRole` checks. (a) 'Add/remove members' is president-only, but 02 says president OR treasurer approve joins and add feature-phone members, and 05 M2 says 'Treasurer can add feature-phone members' — the treasurer is the champion who brings 15–30 members (locked decision 5); president-only breaks the onboarding model. (b) The matrix has no on-behalf confirmation power: 05 M8 requires 'Feature-phone beneficiary: president confirms on their behalf, logged as such, feed-labeled "attesté" — no deadlock', and 02 transition 4 allows president acting for a hasAccount:false payer. As written, a payout to a feature-phone beneficiary has no one able to confirm it and rots into a 7-day auto-dispute every time — a false public 'litige' on the most sensitive record of every such round.

**Fix applied:** Update the matrix: 'Approve joins / add feature-phone members' = treasurer + president; 'Remove members' = president (matching 02's removal-with-note). Add a row 'Confirm on behalf of a feature-phone (hasAccount:false) party — logged and feed-labeled « attesté »' = president (yes), member/treasurer (no; the treasurer is the payout's payer and must not self-confirm). Also extend 02 transition 4's guard from 'hasAccount:false payer' to 'hasAccount:false party' so the payee side (payouts) is covered.

### [MAJOR] §F kill-signal thresholds contradict 05 §C — the one doc that was adversarially reviewed and is the declared decision checkpoint. Conflicts:

**Issue:** §F kill-signal thresholds contradict 05 §C — the one doc that was adversarially reviewed and is the declared decision checkpoint. Conflicts: 04 gates on WhatsApp-share usage ('0 across 2 Rounds' = kill) while 05 explicitly lists share rate under 'Secondary signals (record, don't gate on)'; 04 kills on ANY single gone-dark pilot group while 05's KILL rule requires ≥3/5 groups reverting; 04 omits 05's gated metric '% of confirmed records later disputed or cancelled ≤ 20%' and substitutes a confirmation-latency gate 05 doesn't have. Two different validation protocols guarantee an ambiguous cycle-end decision. Additionally, the weekly metrics cron + `groupMetricsWeekly` table + Resend digest email exceed 05 Week 5's budget ('Half-day: /admin/pilot — one Convex query per kill-signal metric, one plain table per group. Keep it ugly').

**Fix applied:** Make 05 §C the single source of truth for gated metrics and thresholds; rewrite 04 §F to (a) keep only the implementation layer — the events table, event catalog, and the on-demand /admin queries that compute exactly 05's four gated metrics plus its secondary signals; (b) delete 04's independent threshold column (or replace with 'see 05 §C'); (c) demote the weekly cron, groupMetricsWeekly table, and Resend digest to optional post-pilot polish — at 5 groups, opening /admin twice a week is the protocol.

### [MAJOR] §D SMS section conflicts with 02 and 05 twice: (a) 'treasurer-logged cash Contributions for feature-phone members auto-finalize 72h after th

**Issue:** §D SMS section conflicts with 02 and 05 twice: (a) 'treasurer-logged cash Contributions for feature-phone members auto-finalize 72h after the SMS receipt' — 02's `T_AUTO_CONFIRM` is 48h; (b) the whole smsOutbox/provider stack is framed as MVP ('outbound only in MVP', receipts to feature-phone members) while 05 L6 defers ALL SMS to LATER ('push + treasurer's voice covers the pilot') and Week 4 states 'SMS receipt is L6 — until then the public feed is their receipt'. §D also localizes templates per 'membership-level preferredLanguage', a field that doesn't exist in 01 (language lives on users and groups).

**Fix applied:** In 04 §D: change 72h → 48h (`T_AUTO_CONFIRM`); label the SMS architecture as the L6/premium-phase build, not pilot scope (keep the provider research flags); and source template language from `users.language` with `groups.language` fallback per 01, or add the field to 01.

### [MAJOR] Screenshot visibility contradicts 02. 04 §B: proof screenshots 'Visible to: payer, payee, and president... Not to general members.' 02 §d DE

**Issue:** Screenshot visibility contradicts 02. 04 §B: proof screenshots 'Visible to: payer, payee, and president... Not to general members.' 02 §d DECISION: full in-group transparency — 'Every active member of the Group sees the disputed record: ... proof artifacts (txn ID / screenshot)' with the non-authoritative caption.

**Fix applied:** Amend 04 §B: while a record is merely claimed, the screenshot is visible to parties + president; once `disputed`, it is visible to all active group members per 02 §d (with the permanent « ne vaut pas confirmation » caption). Update the access-control note on `ctx.storage.getUrl` accordingly.

### [MINOR] The role matrix says only treasurer/president 'see other members' phone numbers', but 03's pay flow necessarily shows the treasurer's MoMo/O

**Issue:** The role matrix says only treasurer/president 'see other members' phone numbers', but 03's pay flow necessarily shows the treasurer's MoMo/OM number to every member (B4/§C copy-tap fields), and the dispute screen deep-links any party to the payee's WhatsApp. The matrix as written forbids the core pay flow.

**Fix applied:** Add the exception to the role matrix: the current payee's number (treasurer for contributions/fines, beneficiary for payouts) is visible to the counterparty member; all other members' numbers remain treasurer/president-only.

### [MINOR] §B screenshot retention purges images 90 days after the Cycle completes, but 02 makes arrears records claimable 'weeks later' (after cycle c

**Issue:** §B screenshot retention purges images 90 days after the Cycle completes, but 02 makes arrears records claimable 'weeks later' (after cycle completion by design) and disputes never auto-resolve — so the cron can delete the proof artifact of a still-open or disputed arrears record, destroying the only thing screenshots exist for (dispute context).

**Fix applied:** Key retention to the record, not the cycle: purge the image N days (e.g. 90) after the PaymentRecord reaches a terminal state (confirmed/cancelled), and never while the record is claimed or disputed.

### [MINOR] §A rule 3's banned-terms list omits the French vocabulary most likely to creep in for this product: 'caisse' (the actual njangi word for the

**Issue:** §A rule 3's banned-terms list omits the French vocabulary most likely to creep in for this product: 'caisse' (the actual njangi word for the group fund — copy like 'Caisse du groupe : 200 000 F' reads as app-held pooled funds), 'cagnotte', 'fonds disponibles', 'argent disponible', 'encaisser'. The CI copy scan is the load-bearing enforcement for the custody red line, and these are the terms a French copywriter will reach for first.

**Fix applied:** Add caisse/cagnotte/fonds disponibles/argent disponible/encaisser to the banned list with allowlist entries only for clearly record-framed usages (e.g. the treasurer handover statement in 02, labeled as ledger arithmetic, never as an app-held balance).

### [MINOR] §E canonical glossary says Payout = 'versement au bénéficiaire' while 03 §F's LOCKED UI term mapping says Payout → 'le pot / remise du pot'.

**Issue:** §E canonical glossary says Payout = 'versement au bénéficiaire' while 03 §F's LOCKED UI term mapping says Payout → 'le pot / remise du pot'. Two competing canonical lists for the same i18n keys. Culturally, 'le pot' matches how njangi members actually talk about receiving their turn; 'versement' is bank-register French and the weaker choice next to the custody framing rules.

**Fix applied:** Make 04 §E adopt 03's locked mapping ('le pot / remise du pot' in UI; 'versement' acceptable only inside neutral sentences like SMS receipts if needed), and state that 03 §F is the single source of truth for UI terms.

### [MINOR] §E language detection is localStorage → browser → 'fr'. Cheap Androids in Cameroon (Tecno/Infinix/Itel) are very commonly vendor- or shop-co

**Issue:** §E language detection is localStorage → browser → 'fr'. Cheap Androids in Cameroon (Tecno/Infinix/Itel) are very commonly vendor- or shop-configured in English, so a francophone low-literacy first-time user gets her first paint in English — undermining locked decision 9's French default for exactly the target persona, before she finds the FR/EN toggle.

**Fix applied:** Drop browser detection: localStorage('njangi-language') → 'fr'. Keep the prominent FR/EN toggle on the first onboarding screen (03 already has it) as the only way to switch.

### [MINOR] §B cross-group score consent flow assumes the member can see and answer 'Partager votre score de fiabilité avec ce groupe ?' in-app, but has

**Issue:** §B cross-group score consent flow assumes the member can see and answer 'Partager votre score de fiabilité avec ce groupe ?' in-app, but hasAccount:false feature-phone members (a large share of the modeled base) have no UI and no inbound SMS in MVP — the flow is undefined for them, and the gap invites presidents/treasurers to 'consent' on their behalf.

**Fix applied:** Specify: hasAccount:false members default to no-share ('Nouveau membre — pas d'historique partagé') and cannot be consented by proxy; consent becomes available only once they sign up via Clerk and link their Membership.

### [MINOR] Role matrix makes Meeting Mode and contribution-confirmation treasurer-only with no fallback. Real réunions proceed when the trésorier is ab

**Issue:** Role matrix makes Meeting Mode and contribution-confirmation treasurer-only with no fallback. Real réunions proceed when the trésorier is absent or ill — someone deputizes for cash collection that day. In MVP the only recourse is 02's heavyweight mid-cycle treasurer replacement (re-points all open records), so the killer feature is unavailable exactly on the week it's needed, an avoidable pilot kill-signal ('treasurer won't log').

**Fix applied:** Allow the president to run Meeting Mode / payee-side logging as an explicit fallback, with each entry badged in the feed as 'enregistré par le président' (the group-visible audit 04 already uses for sensitive actions). Mirror the actor change in 02's transition table row 3.

### [MINOR] §B screenshot retention ('delete the image 90 days after the Cycle containing the Round completes') has three holes: (a) fine/assistance rec

**Issue:** §B screenshot retention ('delete the image 90 days after the Cycle containing the Round completes') has three holes: (a) fine/assistance records can be round-less (01: `roundId` optional; 02: levies are independent of rounds), so their screenshots have no covering cycle — never purged or undefined cron behavior; (b) arrears records are claimable indefinitely after round close (02 §closing rules), so a screenshot attached to an arrears claim made >90 days after cycle completion could be purged immediately upon upload; (c) disputes never auto-resolve (02 §d), so a dispute still open 90+ days after cycle completion loses its only arbitration artifact — exactly the disputed-then-resolved evidence the artifact exists for.

**Fix applied:** Re-key retention to the record, not the cycle: purge a screenshot only when its paymentRecord is terminal (confirmed/cancelled) AND it has no open dispute AND ≥ 90 days have elapsed since `confirmedAt`/`cancelledAt`/dispute resolution. Note the purge cron itself can ship post-pilot (the pilot ends before any image reaches 90 days), keeping Week-6 hardening lean.

### [MINOR] Schema references in 04 don't exist in 01's schema: §B uses `reversesId` (01 has `amendsPaymentRecordId` + `amendmentKind`) and `proofStorag

**Issue:** Schema references in 04 don't exist in 01's schema: §B uses `reversesId` (01 has `amendsPaymentRecordId` + `amendmentKind`) and `proofStorageId` (01 has `screenshotStorageId`); §A rule 4 says billing 'may only write to `groupSubscriptions`' (01's table is `subscriptions`); §D localizes SMS templates 'per the member's preferredLanguage (membership-level, default fr)' but `memberships` has no language field (01 has `users.language` and `groups.language` for SMS/receipts). The CI rules and lint scripts specced in 04 would be written against field names that don't compile.

**Fix applied:** Align names to 01: `amendsPaymentRecordId`/`amendmentKind`, `screenshotStorageId`, `subscriptions`; for SMS language use `groups.language` (the group-level SMS/receipt language 01 already defines) or, if per-member language is truly wanted, add the optional field to 01's memberships table — pick one and say so.

### [MINOR] Internal contradiction: §F opens with 'No third-party analytics needed at pilot scale' while §G's cost table budgets 'Sentry, PostHog | Free

**Issue:** Internal contradiction: §F opens with 'No third-party analytics needed at pilot scale' while §G's cost table budgets 'Sentry, PostHog | Free tiers' — PostHog appears nowhere else in the spec.

**Fix applied:** Drop PostHog from the §G table (or mark it post-pilot); keep Sentry, which §F explicitly decides on.

### [MINOR] Initial JS budget contradiction: 04 §D says '< 300 KB gzipped'; 03 §G sets the CI-enforced hard limit at '≤ 200 KB gzipped'.

**Issue:** Initial JS budget contradiction: 04 §D says '< 300 KB gzipped'; 03 §G sets the CI-enforced hard limit at '≤ 200 KB gzipped'.

**Fix applied:** Change 04 §D to 200 KB (03 §G is the budget's normative home and the CI gate); or consciously relax 03 to 300 KB — one number.

### [MINOR] Naming drift against 01's schema: `proofStorageId` (twice in §B) vs 01's `screenshotStorageId`; `by_user_group` index vs 01's `by_group_and_

**Issue:** Naming drift against 01's schema: `proofStorageId` (twice in §B) vs 01's `screenshotStorageId`; `by_user_group` index vs 01's `by_group_and_user`; `groupSubscriptions` (commandment 4) vs 01's `subscriptions`; `reversesId` (§B) vs 01's `amendsPaymentRecordId`.

**Fix applied:** Align all four names in 04 to 01's schema (`screenshotStorageId`, `by_group_and_user`, `subscriptions`, `amendsPaymentRecordId` — the last pending the confirmed-exit blocker's resolution).

### [MINOR] i18n glossary/keys drift vs 03's locked copy guide: 04 §E says Payout = « versement au bénéficiaire » while 03 §F locks Payout → « le pot / 

**Issue:** i18n glossary/keys drift vs 03's locked copy guide: 04 §E says Payout = « versement au bénéficiaire » while 03 §F locks Payout → « le pot / remise du pot »; 04's key namespaces list `meetingMode.*` and omit the namespaces 03 actually uses (`home.*`, `pay.*`, `claim.*`, `confirm.*`, `meeting.*`, `profile.*`) and 02's `invite.whatsappMessage`.

**Fix applied:** Align 04 §E's FR glossary to 03 §F's locked term mapping and regenerate the namespace list from the canonical keys in 02/03 (including `invite.*`); pick `meeting.*` or `meetingMode.*` once.

### [MINOR] Kill-signal thresholds diverge from 05's validation protocol (the reviewed doc and 'the only checkpoint that counts'): 04 §F kills treasurer

**Issue:** Kill-signal thresholds diverge from 05's validation protocol (the reviewed doc and 'the only checkpoint that counts'): 04 §F kills treasurer entry at <60% for 2 rounds vs 05's KILL at <50% by round 3 in ≥3 groups; member opens kill at <30% (04) vs pivot at <50% (05); handshake failure at >40% auto-disputed (04) vs >20% dispute rate (05). 04 also calls the route `/admin` where 05 calls it `/admin/pilot`.

**Fix applied:** Make 04 §F's table reference 05 §C's thresholds and decision rules verbatim (or just point at 05 §C as normative), and rename the route to `/admin/pilot`.

### [MINOR] Treasurer-absconds mitigation (§C) says a round with confirmed contributions but unconfirmed payout 'past X days is auto-flagged Disputed' —

**Issue:** Treasurer-absconds mitigation (§C) says a round with confirmed contributions but unconfirmed payout 'past X days is auto-flagged Disputed' — X is unspecified, and 02 has no timer at all on a never-claimed (`pending`) payout; auto-dispute only fires on claimed payer-side records at 72h.

**Fix applied:** Specify the mechanism: if the treasurer claimed the payout, the beneficiary-silence auto-dispute is 02's `T_AUTO_DISPUTE` (72h); for a payout never claimed after round close, either add a stale-pending-payout alert to 02's timer table or soften 04's wording to the dashboard 'Impayés' surfacing 02 already provides.

### [MINOR] Meeting Mode access drift: 04's role matrix grants Meeting Mode to treasurer only; 03 B6's header says '(treasurer/president only)'. (03's o

**Issue:** Meeting Mode access drift: 04's role matrix grants Meeting Mode to treasurer only; 03 B6's header says '(treasurer/president only)'. (03's own route-tree comment says treasurer — but the cross-doc conflict is with 04.)

**Fix applied:** Pick one: simplest is treasurer-only everywhere (matches 02 §c's payee-side claim being the treasurer's), updating 03 B6's header; if president access is wanted for the president-as-treasurer small-group case, add president to 04's matrix row instead.

## 05-mvp-plan (30 issues)

### [BLOCKER] Week 1 schema spec defines `paymentRecordStateValidator` with SIX literals including stored `ledger_final` — contradicting 01 §3.2 (DECISION

**Issue:** Week 1 schema spec defines `paymentRecordStateValidator` with SIX literals including stored `ledger_final` — contradicting 01 §3.2 (DECISION: ledger-final is derived, never stored; five literals), 02 ('`confirmed` IS ledger-final'), and 04 commandment 6, whose CI test asserts the union equals exactly `pending|claimed|confirmed|disputed|cancelled`. As written, Week 1 code fails Week 1 CI. It also contradicts 05's own M4 ('confirmed (= ledger-final)').

**Fix applied:** In 05 Week 1, drop `ledger_final` from the validator (five literals) and change the Week 2 demo line to 'pending→claimed→confirmed walk; ledger-final is derived (confirmed + round closed) per 01 §3.2'.

### [MAJOR] Assistance levies are unloggable in MVP, contradicting the pilot promise. Section C promises treasurers 'their fines/levy rules respected (l

**Issue:** Assistance levies are unloggable in MVP, contradicting the pilot promise. Section C promises treasurers 'their fines/levy rules respected (logged manually if needed)', but M14 only supports kind:fine and L3 demotes all AssistanceLevy flows. 01's invariant I-5 even requires an assistanceLevyId for any assistance record, so there is no manual path at all. A bereavement (deuil) is near-certain across 5 groups over a multi-month pilot; assistance is core njangi practice (locked decision 7). The only workarounds are mislabeling a death levy as an 'amende' — culturally unacceptable — or reverting to the notebook, which directly contaminates the 'groups revert to notebook' kill-signal.

**Fix applied:** Promote a minimal assistance entry into MUST alongside M14: president/treasurer launches an AssistanceLevy (label, amount-per-member, exclusions) per 02 §f's last paragraph — which already specifies it as the fine machinery minus the proposal step. Schema and state machine already exist; this is ~1 day like M14. Keep levy progress UI, exclusion edge cases, etc. in L3. Also add 'how do your assistance/levy rules work?' to the intake interview (it currently asks fine rules only).

### [MAJOR] M3 drops the 'begging the turn' swap that 02 explicitly models. M3 states 'Order is immutable, but entries can be marked skipped (member exi

**Issue:** M3 drops the 'begging the turn' swap that 02 explicitly models. M3 states 'Order is immutable, but entries can be marked skipped (member exit/death/expulsion)', but 02 §rotation-order defines post-lock OrderChange records that swap two future beneficiaries and calls it 'the common begging-the-turn practice'. The scope table is the build contract; built from 05 as written, the first member who negotiates a swap mid-pilot (school fees, funeral — routine in real njangis) forces the group to improvise off-app and the locked public order — the trust wedge — diverges from reality.

**Fix applied:** Amend M3 to include the OrderChange swap of two future beneficiaries (president-only, mandatory note, group-visible) per 02 §rotation-order, alongside skips/removals. No new design needed — 05 just has to stop excluding it.

### [MAJOR] The validation checkpoint is arithmetically impossible for monthly groups. Pilot groups are 15–30 members; a monthly njangi's full cycle is 

**Issue:** The validation checkpoint is arithmetically impossible for monthly groups. Pilot groups are 15–30 members; a monthly njangi's full cycle is therefore 15–30 MONTHS, yet section C declares decisions happen 'after one full Cycle (the only checkpoint that counts)', PERSEVERE asks treasurers to pay 'from cycle 2', and section C offers 'free premium for the full Cycle'. R6 staggers schedules but never confronts that the checkpoint never arrives for monthly groups within any realistic solo-dev pilot horizon. Weekly groups (15–30 weeks) are the only ones where the locked 'one full rotation observed' is feasible.

**Fix applied:** Bound recruiting and the protocol: recruit monthly groups only if small (≤8 members), ensure ≥2 weekly groups so at least two full rotations complete within ~6 months, and define an interim checkpoint for slower groups (e.g. decision data frozen at min(full cycle, 10 rounds or 5 months)). Cap the free-premium offer at e.g. 6 months rather than 'the full Cycle'.

### [MAJOR] Week 4's offline DECISION loses Meeting Mode taps exactly when it matters. 'Taps lost if app killed before sync' is treated as an edge case,

**Issue:** Week 4's offline DECISION loses Meeting Mode taps exactly when it matters. 'Taps lost if app killed before sync' is treated as an edge case, but on the launch-checklist target device (≤2GB RAM Android) Chrome evicts background tabs aggressively — and a treasurer WILL switch to WhatsApp or the phone app mid-réunion. The stated mitigation ('N en attente de synchro' counter) dies with the tab, so the loss is silent: the treasurer believes entries were recorded, members were never notified, and the ledger silently disagrees with the réunion — the worst possible failure for a trust product, in its killer feature.

**Fix applied:** Keep the no-IndexedDB scope guard but persist the unsynced tap queue (tiny array of {recordId, idempotencyKey, amount, ts}) to localStorage, replaying on next open with a 'X entrées récupérées' toast. Hours of work, not the offline-first store the DECISION rightly rejects. Add 'kill the tab mid-roll-call, reopen, verify zero lost entries' to the Week 6 / launch-checklist device test.

### [MAJOR] The pilot mix never tests the mass-market user. Targets are '2 church njangis, 1 office, 1 quartier, 1 alumni' — office and alumni are the m

**Issue:** The pilot mix never tests the mass-market user. Targets are '2 church njangis, 1 office, 1 quartier, 1 alumni' — office and alumni are the most literate, smartphone-saturated, easiest segments. There is no market / bayam-sellam tontine, i.e. the archetypal low-literacy, feature-phone-dense, cash-dominant group the product's UX bar (and decision rule 'confirmation too hard for low-literacy users') is supposedly calibrated against. A PERSEVERE verdict from this mix extrapolates to a population the pilot never sampled.

**Fix applied:** Swap one slot (alumni or office) for a market-women's tontine in Douala, accepting the harder recruiting. If genuinely unreachable through contacts, state explicitly in §C that the pilot validates the smartphone-literate segment only and that the treasurer-only pivot is the expected mode for market groups.

### [MAJOR] Week 1 schema defines `paymentRecordStateValidator` as `pending|claimed|confirmed|ledger_final|disputed|cancelled`, and the Week 2 demo walk

**Issue:** Week 1 schema defines `paymentRecordStateValidator` as `pending|claimed|confirmed|ledger_final|disputed|cancelled`, and the Week 2 demo walks 'pending→claimed→confirmed→ledger-final'. `ledger_final` is a phantom state: 02's transition table has no transition into it (confirmed IS ledger-final), and 01 has an explicit DECISION that ledger-final is derived, not stored (5 literals only). As written, the validator contains an unreachable state and contradicts both upstream docs at the core primitive.

**Fix applied:** Drop the `ledger_final` literal from the Week 1 validator list (keep 01's derived-ledger-final decision: confirmed + round closed). End the Week 2 demo at `confirmed`. While there, align the validator name (05 says paymentRecordStateValidator, 02 says paymentRecordStatusValidator, 01 says paymentStateValidator) — pick one.

### [MAJOR] No correction path for a wrongly-confirmed record. Week 2 says cancel is 'never from confirmed', yet M4 adopts the machine 'per 02' — and 02

**Issue:** No correction path for a wrongly-confirmed record. Week 2 says cancel is 'never from confirmed', yet M4 adopts the machine 'per 02' — and 02 transition 12 (president override confirmed→cancelled, error reversal) plus 02 §e6 double-payment resolution depend on exactly that exit. 01 instead uses amendment records (reversal/correction), which are nowhere in 05's MUST scope. Net result in the MVP as planned: a Meeting Mode fat-finger (treasurer ticks the wrong member; feature-phone payer gets no notification since SMS is L6; auto-confirm fires at T_AUTO_CONFIRM) produces a confirmed record that can never be corrected — an absorbing error state in an app whose product is ledger trust. This WILL happen in pilot.

**Fix applied:** Pick one correction mechanism and put it in M4/Week 2 scope. Cheapest: adopt 02's confirmed→cancelled president override (mandatory note, immutable override record) and delete the 'never from confirmed' clause for the president-override case only. If you instead keep 01's amendment-record model, add it to Week 2 explicitly and amend 02 transition 12.

### [MAJOR] Round-close authority contradiction. M8 and Week 2 say 'treasurer may close a round with a shortfall', but 02 §b closing rules are explicitl

**Issue:** Round-close authority contradiction. M8 and Week 2 say 'treasurer may close a round with a shortfall', but 02 §b closing rules are explicitly 'system-driven, no human gate' (close fires at graceEndAt, or earlier only when all contribution records are terminal — impossible when a shortfall means open pendings). 00's review note claims 05 was aligned to 02's machine; this slipped through. The thing M8 actually needs — paying the beneficiary despite a shortfall — is already covered by 02's payout-runs-parallel-from-open rule and arrears handling, so the manual close adds nothing but a conflicting transition.

**Fix applied:** Remove treasurer-manual close from M8 and Week 2; state that rounds close per 02 (system at graceEndAt; shortfall = arrears records stay open; payout claimable any time after open, so the beneficiary never waits on close). If a manual close is truly wanted, add a guarded president-close transition to 02 instead — but the simplest correct answer is deletion.

### [MAJOR] Kill-signal 3 ('Ledger doesn't reflect reality': '% of confirmed records later disputed or cancelled') measures transitions that mostly cann

**Issue:** Kill-signal 3 ('Ledger doesn't reflect reality': '% of confirmed records later disputed or cancelled') measures transitions that mostly cannot occur. confirmed→disputed exists in NO doc's machine (disputes always precede confirmation: claimed→disputed→confirmed is the late-confirm path), so the 'later disputed' half is structurally zero; and under 05's own Week 2 rule ('never from confirmed') the 'later cancelled' half is zero too. Consequently the metric always reads green and the PIVOT rule 'dispute rate >20% → confirmation handshake misdesigned' can never fire — the validation protocol's third checkpoint is dead as specified.

**Fix applied:** Redefine the metric as: (records that ever entered `disputed`) ÷ (records that reached `claimed`), measured per group per round, plus a separately-tracked count of president override-cancels/amendments of confirmed records. Update the PIVOT rule to reference the redefined dispute rate.

### [MAJOR] Week 3 is overloaded for one developer: round screen + full claim flow with method-specific MoMo/OM/cash screens + USSD content + txn-ID/scr

**Issue:** Week 3 is overloaded for one developer: round screen + full claim flow with method-specific MoMo/OM/cash screens + USSD content + txn-ID/screenshot upload + treasurer confirmation inbox + the entire payout flow + prewarm data-layer plumbing + all i18n strings (fr+en) + push infrastructure that the doc itself budgets at 2–4 days. That is ~8–10 dev-days in a 5-day week, with zero slack anywhere in the 6-week plan; Week 3 slipping cascades into Meeting Mode (Week 4), the plan's killer feature.

**Fix applied:** Move the payout flow to Week 4 (it reuses the claim/confirm components and isn't needed until the first round closes; Meeting Mode and payout can be built together). Demote the prewarm-sibling work (-group.data.ts, useRoutePrewarmIntent) to Week 6 polish or LATER — it is a perf nicety, not MVP-critical for 15–30-member groups.

### [MAJOR] Section C recruiting puts no bound on cycle length, but the decision rules say one full Cycle is 'the only checkpoint that counts' (locked d

**Issue:** Section C recruiting puts no bound on cycle length, but the decision rules say one full Cycle is 'the only checkpoint that counts' (locked decision 11). Cycle length = member count × period: a 25-member monthly njangi takes ~2 years, a 20-member biweekly one ~9 months — meaning a solo dev free-supporting 5 groups (R8) with the PERSEVERE/monetization decision potentially years away. R6's staggering note acknowledges calendar spread but not multi-year cycles. The KILL rule has an early exit (round 3) but PERSEVERE does not.

**Fix applied:** Add a recruiting criterion to §C: pilot groups must be able to complete a full cycle within ~3–4 months (i.e., prefer weekly/biweekly groups; admit a monthly group only if small, ~3–4 members, or explicitly exclude it from the cycle-end PERSEVERE denominator and gate it on the round-3 interim signals only). This respects locked decision 11 while making the checkpoint reachable.

### [MAJOR] Week 2 DECISION: 'X = 3 days for contributions, 7 for payout' — but 02 has a single `T_AUTO_DISPUTE` = 72h that explicitly covers payouts to

**Issue:** Week 2 DECISION: 'X = 3 days for contributions, 7 for payout' — but 02 has a single `T_AUTO_DISPUTE` = 72h that explicitly covers payouts too (§b: 'including auto-dispute after T_AUTO_DISPUTE if treasurer claimed and beneficiary is silent'). A 7-day payout window has no constant in 02's timer table.

**Fix applied:** In 05 Week 2, use 72h (`T_AUTO_DISPUTE`) for both contribution and payout claims, citing 02's timer table; if a longer payout window is genuinely wanted, add a `T_AUTO_DISPUTE_PAYOUT` constant to 02's table first — one source of truth either way.

### [MAJOR] Round closing actor contradicts 02. 05 M8 ('Treasurer may close a round with a shortfall') and Week 2 ('close round (allowed with shortfall.

**Issue:** Round closing actor contradicts 02. 05 M8 ('Treasurer may close a round with a shortfall') and Week 2 ('close round (allowed with shortfall...)') imply a treasurer-initiated close; 02 §b is explicit: closing is 'system-driven, no human gate' at `graceEndAt` (or earlier when all contribution records are terminal). 01's `closed` comment ('treasurer closed') repeats the deviation.

**Fix applied:** Rewrite 05 M8/Week 2: rounds auto-close at `graceEndAt` per 02; the treasurer's actions are claiming the payout and (implicitly) letting arrears stand — shortfall handling is the system's frozen obligation statuses + open arrears records. Fix 01's `closed` comment in the same pass (covered by the round-state blocker).

### [MINOR] Week 1 lists `ledger_final` as a stored literal in paymentRecordStateValidator (`pending|claimed|confirmed|ledger_final|disputed|cancelled`)

**Issue:** Week 1 lists `ledger_final` as a stored literal in paymentRecordStateValidator (`pending|claimed|confirmed|ledger_final|disputed|cancelled`), contradicting 01's DECISION that ledger-final is derived (confirmed + round closed) and 02's treatment of confirmed as ledger-final. 05's own M4 ('confirmed (= ledger-final)') agrees with the derived model, so the Week 1 list is a slip.

**Fix applied:** Remove `ledger_final` from the Week 1 validator list; keep 01's derived definition (no bulk writes at round close).

### [MINOR] The launch-checklist custody copy audit greps English-only phrases ('send money', 'collect', 'wallet', 'payment processing') in src/i18n/loc

**Issue:** The launch-checklist custody copy audit greps English-only phrases ('send money', 'collect', 'wallet', 'payment processing') in src/i18n/locales/*.json — but the primary locale is French, so the audit as specified would pass a French UI containing 'solde', 'portefeuille', 'collectez les cotisations' or 'envoyez de l'argent via l'application'. 04 rules 3 and 7 already define the correct bilingual banned-terms CI scan; 05's checklist item is a weaker, divergent restatement of it.

**Fix applied:** Replace the four hardcoded English phrases in the checklist item with a reference to 04's banned-terms list (rules 3 + 7: solde, portefeuille, déposer, retirer des fonds, recharger, 'envoyez de l'argent via', 'payez dans l'application', plus the English terms) and to scripts/custody-copy-allowlist.json, so there is exactly one list.

### [MINOR] Buea is in the Anglophone Southwest, but the approach script exists only in French and §C specifies 'Approach script (French, in person or W

**Issue:** Buea is in the Anglophone Southwest, but the approach script exists only in French and §C specifies 'Approach script (French, in person or WhatsApp voice note)'. Pitching a Buea njangi treasurer in French is a culture miss in the exact city chosen for the pilot; terminology also differs (in Buea it is 'njangi' in English/Pidgin, while many Douala francophones say 'tontine' or 'réunion').

**Fix applied:** Add an English/Pidgin variant of the approach script for Buea, including the verbatim red-line reassurance ('The app never touches the money'), and note that Douala pitches should say 'tontine (njangi)'.

### [MINOR] Week 4 claims 'until then the public feed is their receipt' for feature-phone members — false: a member without the app cannot see the in-ap

**Issue:** Week 4 claims 'until then the public feed is their receipt' for feature-phone members — false: a member without the app cannot see the in-app feed, so MVP feature-phone members have NO receipt channel and no fine notification (02's transition table and fine flow assume SMS receipts that 05's L6 demotes, an unresolved contradiction between the docs).

**Fix applied:** Reword Week 4: the feature-phone member's receipt in pilot is the réunion read-out plus the treasurer's voice/WhatsApp relay, and add 'read out auto-confirmed entries for feature-phone members' to the Meeting Mode close step / treasurer one-pager. Align 02 by marking its 'SMS receipt to feature-phone' notification rows as L6/premium, not MVP.

### [MINOR] M14 gives fine-assessment authority to the treasurer ('treasurer logs member + amount + reason'), but 02 §f deliberately routes all fines th

**Issue:** M14 gives fine-assessment authority to the treasurer ('treasurer logs member + amount + reason'), but 02 §f deliberately routes all fines through president confirmation ('Auto-proposed, president-confirmed — never auto-charged', creation actor 'president action for fine/assistance') — matching njangi practice, where fines carry the president's/assembly's authority and the treasurer merely collects. A treasurer unilaterally creating amendes is both an authority misallocation and a doc contradiction.

**Fix applied:** Align M14 with 02: manual fine entry is created (or at minimum confirmed) by the president; the treasurer may draft it at the réunion for the president to confirm with one tap. Keep the collection handshake unchanged.

### [MINOR] Clerk SMS OTP deliverability to +237 MTN/Orange numbers — the single point of failure for onboarding a phone-number-identity user base — app

**Issue:** Clerk SMS OTP deliverability to +237 MTN/Orange numbers — the single point of failure for onboarding a phone-number-identity user base — appears nowhere in 05. 04 carries a RESEARCH FLAG to verify it in week 1 (with WhatsApp OTP as fallback), but 05's Week 1 tasks and launch checklist omit it even though the analogous USSD-instruction verification made the checklist. If OTPs do not arrive at the réunion, the in-person onboarding of group #1 fails live.

**Fix applied:** Add to Week 1: verify Clerk SMS OTP delivery on real MTN and Orange Cameroon SIMs; decide the WhatsApp-OTP fallback per 04's flag. Add a launch-checklist item: 'OTP sign-up verified on live MTN + Orange SIMs within 7 days of launch', mirroring the USSD item.

### [MINOR] The intake interview never asks how money physically reaches the beneficiary. 01's invariant I-5 hard-codes contribution payee = treasurer, 

**Issue:** The intake interview never asks how money physically reaches the beneficiary. 01's invariant I-5 hard-codes contribution payee = treasurer, but some MoMo-era njangis have members send directly to the round's beneficiary (avoids double MoMo transfer/withdrawal fees and treasurer risk). Onboarding such a group means every contribution record names a payee who never received the money — the treasurer must confirm receipts that did not happen, falsifying the ledger the product exists to make truthful.

**Fix applied:** Add to §C intake: 'how does money reach the beneficiary — collected by the treasurer, or sent member-to-beneficiary directly?' Screen pilot groups for the treasurer-mediated flow the model supports, and note direct-to-beneficiary as a known model limitation (future relaxation of I-5 in 01) rather than discovering it in round 1.

### [MINOR] Timer/cron drift vs 02: Week 2's DECISION sets auto-dispute X = 3 days for contributions and 7 days for payouts evaluated by a daily cron, w

**Issue:** Timer/cron drift vs 02: Week 2's DECISION sets auto-dispute X = 3 days for contributions and 7 days for payouts evaluated by a daily cron, while 02's global table fixes T_AUTO_DISPUTE = 72h app-wide for all kinds, evaluated by a single 15-minute cron. 3d matches 72h but the 7-day payout window contradicts 02, and a daily cron makes the 48h T_AUTO_CONFIRM land anywhere up to ~72h — stretching the Meeting Mode objection window unpredictably.

**Fix applied:** Reference 02's timer table and 15-minute cron from Week 2 instead of redefining them; if the 7-day payout window is intended, add a T_AUTO_DISPUTE_PAYOUT constant to 02's global timer table so there is one source of truth.

### [MINOR] Week 4 says feature-phone members' receipt for payee-side claims is 'the public feed' until SMS (L6) ships — but feature-phone members by de

**Issue:** Week 4 says feature-phone members' receipt for payee-side claims is 'the public feed' until SMS (L6) ships — but feature-phone members by definition cannot open the app or see the feed. Their auto-confirm 'objection window' is therefore notification-less: zero actual notice before a record confirms in their name. Practical risk is low (cash handed in person at the réunion), but the stated mitigation is impossible as written, and 02's transition 3 promises them an SMS receipt the MVP doesn't ship.

**Fix applied:** Correct the rationale: the réunion itself plus the WhatsApp-shared round summary (read to them or shown by family) is the real receipt during pilot. Alternatively, pull a minimal SMS receipt for payee-side claims only into MUST (volume is tiny: one SMS per feature-phone member per round) and leave reminder SMS in L6.

### [MINOR] Self-records (payer == payee) are unspecified anywhere: every round pre-creates a contribution record for every active member with payee = t

**Issue:** Self-records (payer == payee) are unspecified anywhere: every round pre-creates a contribution record for every active member with payee = treasurer, including the treasurer's own contribution; and when the treasurer is the round's beneficiary, the payout record is treasurer→treasurer. The two-sided handshake and 02's guards ('the side that did NOT claim') are undefined when both sides are the same membership. The Week 6 2-member seed group (where president = treasurer is allowed per 02) makes these records half the ledger.

**Fix applied:** Add one line to Week 2's state-machine notes: records where payerMembershipId == payeeMembershipId are claimed-and-confirmed in a single mutation (no timers, no counterparty), feed-labeled 'auto (trésorier — propre cotisation)' so the group sees them; assert this path in the colocated state-machine tests and the 2-member Playwright spec.

### [MINOR] Week 2 grants cancel to 'the claimant or treasurer-on-behalf', but 02 transition 8 restricts cancel to the claimant only, and 02's on-behalf

**Issue:** Week 2 grants cancel to 'the claimant or treasurer-on-behalf', but 02 transition 8 restricts cancel to the claimant only, and 02's on-behalf powers belong to the president (for hasAccount:false parties), not the treasurer. Treasurer-on-behalf cancel is also a conflict of interest: the treasurer is the payee of every contribution record they would be cancelling.

**Fix applied:** Change Week 2 to match 02: cancel by the claimant only, with the president (not treasurer) able to act for hasAccount:false parties, logged as such.

### [MINOR] Week 2's 'close round' is specified 'per 02', but 02's closing procedure (step 4) includes auto-generating fine proposals from the group fin

**Issue:** Week 2's 'close round' is specified 'per 02', but 02's closing procedure (step 4) includes auto-generating fine proposals from the group fine policy — which 05 explicitly demoted to L2 (M14 is manual fines only). The blanket reference silently pulls L2 scope into Week 2.

**Fix applied:** Add one clause to Week 2: round close implements 02's closing rules steps 1–3 and 5 only; step 4 (fine auto-proposals) is L2 and excluded — fines in MVP are entered manually per M14.

### [MINOR] The launch-checklist disclaimer asserts the app 'never holds, transfers, or instructs the transfer of funds' — but M5 (per locked decision 1

**Issue:** The launch-checklist disclaimer asserts the app 'never holds, transfers, or instructs the transfer of funds' — but M5 (per locked decision 1) ships step-by-step USSD instruction screens with the treasurer's number prefilled and a copy button, which is plainly 'instructing a transfer' in the ordinary sense. Proposing legal copy that the product visibly contradicts hands a regulator (and opposing counsel) an easy inconsistency, even though the feature itself is within the locked custody-free model.

**Fix applied:** Reword the checklist disclaimer to 'never initiates, executes, processes, or intermediates transfers; provides general guidance for transactions members perform themselves on their own MoMo/Orange Money accounts or in cash' — and let counsel finalize from that accurate baseline.

### [MINOR] Cron cadence drift: 05 Week 2 specs a 'daily job' for auto-dispute/auto-confirm; 02 specs 'a single cron in convex/crons.ts running every 15

**Issue:** Cron cadence drift: 05 Week 2 specs a 'daily job' for auto-dispute/auto-confirm; 02 specs 'a single cron in convex/crons.ts running every 15 minutes' — and 02's 24h/48h reminder timers need sub-daily resolution.

**Fix applied:** Change 05 Week 2 to the single 15-minute cron per 02's timer-table DECISION.

### [MINOR] M8 says payout amount is 'entered by treasurer at claim time — app records reality, never computes/asserts an owed amount', but 02 §b pre-cr

**Issue:** M8 says payout amount is 'entered by treasurer at claim time — app records reality, never computes/asserts an owed amount', but 02 §b pre-creates the payout record at round open WITH a computed amount (members × contribution), editable at claim; 03's wireframes likewise display computed expected pots ('Pot : 80 000 / 120 000 F').

**Fix applied:** Soften M8 to 'prefilled from the expected pot (members × contribution, per 02), editable by treasurer at claim time — the recorded amount is what was actually handed over'; this keeps the R4/R7 framing (record, don't assert) without contradicting 02's pre-creation. If 'never computes' is a hard line, 02 §b must instead create the payout record amount-less.

### [MINOR] Week 3 push infrastructure lists a 'subscription table' for push subscriptions; 01's DECISION stores `pushTokens` as an array on `users` ('a

**Issue:** Week 3 push infrastructure lists a 'subscription table' for push subscriptions; 01's DECISION stores `pushTokens` as an array on `users` ('a table is overkill for MVP').

**Fix applied:** Change 05 Week 3 to 'pushTokens array on users per 01' — or, if web-push subscription churn justifies a table, override 01's DECISION there explicitly. One storage shape.
