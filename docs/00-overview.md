# Njangi App — MVP Spec Overview

**Date:** 2026-06-11
**Product:** Custody-free njangi/tontine ledger app for Cameroon — "njangi operating system with Cash App polish."
**Builder:** Solo developer (also runs Piol housing marketplace). Free-first, monetize later.
**Research basis:** `../../bus-ticketing-research/` — verified market: ~190bn FCFA in tontines, 58% of Cameroonians prefer tontines over banks, no digital winner (Djangui ~50k users in 10 years; Tontiin, Njangee stalled). Real competitor: **WhatsApp + paper notebook**.

## Spec documents

| Doc | Contents |
|---|---|
| [01-domain-model.md](01-domain-model.md) | Entities, Convex schema, indexes, invariants, reliability score |
| [02-lifecycle-state-machines.md](02-lifecycle-state-machines.md) | Group/Cycle/Round lifecycles, PaymentRecord state machine, dispute flow, edge cases |
| [03-screens-ux.md](03-screens-ux.md) | Route tree, wireframes, pay/confirm flows, meeting mode, USSD instructions, notifications, copy guide |
| [04-non-functional.md](04-non-functional.md) | Regulatory guardrails, security/privacy, abuse cases, offline, i18n, observability, costs |
| [05-mvp-plan.md](05-mvp-plan.md) | Scope table (MUST/LATER/NEVER), week-by-week build order, validation protocol, risks |

## Locked decisions

1. **Model A, custody-free.** App NEVER moves, holds, or instructs movement of member money via any payment API. Money moves wallet-to-wallet on MTN MoMo (*126#) / Orange Money (#150#) or as physical cash. App = scheduler + ledger + proof + reminders, with clear USSD step-by-step instructions. Why: Cameroon's May-2025 fintech licensing crackdown is actively enforced (CEMAC 04/18, Art. 84); unlicensed payment facilitation = shutdown. Only PSP integration ever: collecting the app's OWN premium subscription fee (app as merchant, e.g. CamPay 2% flat).
2. **Core primitive = two-sided acknowledgment.** PaymentRecord: `pending → claimed (payer logs) → confirmed (payee acknowledges)`; `disputed` after N days unconfirmed; `cancelled`. Truth = payee confirmation, never the proof artifact.
3. **Method-agnostic ledger.** `momo_mtn | orange_money | cash | bank(later)`. Proof: MoMo txn ID (nudged) or screenshot (accepted, not trusted — dispute artifact only). Cash needs no artifact. Mixed-method rounds are normal.
4. **Meeting mode** = killer cash feature. Treasurer roll-call at the réunion: tap = cash received, amount prefilled, ~20 entries in 2 minutes, members confirm on their phones, summary shareable to WhatsApp.
5. **Group is the unit, treasurer is the buyer.** Onboard whole existing njangis via a champion (president/treasurer brings 15–30 members).
6. **Trust features are the wedge:** immutable history, group-visible who-paid-who-when, locked public rotation order, fines tracked, portable reliability score (the thing offline njangis can't do).
7. **Reality features:** fines, meeting schedule, assistance levies (bereavement/wedding), loans-within-group recording only, feature-phone members (treasurer logs for them + SMS receipt), payout via same handshake reversed.
8. **Monetization (free-first):** free = core ledger, 1 group, reminders. Premium per group (treasurer pays ~1,000–2,500 FCFA/month via MoMo): SMS reminders, exports, multiple/larger groups. NEVER: float, lending, custody. Precedent: Djamo — 25% of 1M+ Francophone-African users pay premium.
9. **UX bar = Cash App polish**, French default / English fallback, offline-tolerant, low-end Android — and iOS from day one. **Mobile-only native app; there is no web frontend** (2026-06-11 pivot).
10. **Stack = Expo (React Native) + Convex + Clerk** — Android AND iOS from day one via EAS; patterns copied from `piol-vite/apps/mobile` (2026-06-11 pivot, supersedes the earlier TanStack Start web stack; web frontend deleted). Backend unchanged: same Convex deployment (`resolute-rooster-437`), same schema/state machine/functions — `convex/` is untouched. Push = expo-notifications (replaces web push). WhatsApp shares = text + store/deep link (`njangi://` scheme; https universal links later) — no web share layer. USSD instructions can deep-link the dialer (`tel:` URL with encoded `#`).
11. **Validation:** 5 real njangi groups (Douala/Buea), one full rotation observed. Kill signals: treasurers won't log, members don't open, groups revert to WhatsApp + notebook.

## Review status (2026-06-11)

**Review complete.** Two passes:
1. Initial scope review of 05 (10 issues: 2 blockers, 5 majors, 3 minors) — applied.
2. Full adversarial review: every doc × (njangi-culture + regulatory lens, solo-dev-scope + correctness lens) + a cross-doc consistency reviewer. **201 issues found** (14 blockers, 111 majors); all blockers/majors applied in the revised docs, minors where cheap. Full list with applied fixes: [review-findings.md](review-findings.md).

**2026-06-11 mobile pivot (locked, post-review — overrides the prior web/PWA framing):** njangi is a **mobile-only Expo (React Native) app**, Android AND iOS from day one via EAS; the web frontend is deleted. Rationale: the pilot user lives on a phone; native push (expo-notifications) is reliable where web push wasn't (iOS web push required an installed PWA); USSD instructions can deep-link the dialer (`tel:` URL with encoded `#`) — better than the web could do; WhatsApp shares work as text + store/deep link (`njangi://` scheme, https universal links later), so no web share layer is needed. Backend unchanged: same Convex deployment (`resolute-rooster-437`), same schema, state machine, and functions — the `convex/` directory is untouched sacred ground. The custody-free red line (decision 1) is unchanged. 00 and 05 are updated for the pivot; read any remaining web/PWA mentions in 03–04 through this lens.

Key outcomes of the review: `ledger_final` is derived, never stored (5-state validator); rounds close system-driven at `graceEndAt`, no human gate; president override is the only exit from `confirmed`; `collectionMode` added (`via_treasurer` | `direct_to_beneficiary` — many MoMo njangis pay the beneficiary directly, intake must screen for it); OrderChange swaps ("begging the turn") included in MVP; M15 minimal assistance levy added (a deuil is near-certain across 5 pilot groups); Meeting Mode tap queue persisted to local storage (silent-loss fix; localStorage at review time, AsyncStorage after the mobile pivot); pilot recruiting bounded to groups that complete a cycle in ~3–4 months; Buea pitch script in English/Pidgin.

Remaining human TODO: a real njangi treasurer reads 02 + 03; Cameroon counsel reviews the disclaimer baseline in 05's launch checklist; verify Clerk SMS OTP delivery on live MTN/Orange SIMs (Week 1).

## Regulatory red line (never cross without local counsel + license)

- No payment APIs for member money. No balances implying the app holds value. No pooling. No lending. No "send money through the app" copy.
- Refuted in research: operating payment services under a partner's license without your own — that's exactly what the Aug-2025 enforcement shut down.
