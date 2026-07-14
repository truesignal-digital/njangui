# Serve-sim UI review — implementation + verification record

Date: 2026-07-10
Responds to: `2026-07-10-serve-sim-ui-review-handoff.md`
Verified on: iPhone 16 Pro, iOS 18.6 dev build, mock pilot Paul Nfor, three
Codex (gpt-5.6-sol) computer-use passes over `serve-sim` plus manual sweeps.
Evidence: `/tmp/ui-review-pass{1,2,3}/` (screenshots + reports, per-machine).

## Status by handoff item

| Handoff item | Status |
| --- | --- |
| P0 payment capability gating | Done + verified in all four states (missing phone, invalid number, operator mismatch, valid MTN) |
| P1 status-bar scroll collision | Done + verified while scrolled (opaque `StatusBarCover`, explicit zIndex) |
| P1 native tab items disappearing | Mitigated (memoized tab-bar props); did NOT reproduce in the final 4-cycle sweep — still needs a release-build/physical-device pass before calling it closed |
| P1 Actions scannability | Done + verified (per-family icons/tints, group-first context, 1-line detail, "N days late", scroll-to-top on focus) |
| P1 Groups sort/affordance/copy | Done + verified ("3 need you" header, needs-you-first order, chevron always, human state lines, date yields to chip) |
| P1 dispute destination | Done + verified (owner/next-step status block, human timestamps, labeled reference, capitalized method) |
| P2 group detail recompose | Done + verified (rotation collapsed to current+next with toggle, "Order locked"/"This round", "Offline member", activity dedupe ×N) |
| P2 calendar | Done + verified (group name in header, "Next" badge, no single-row month summary echo, no-break-space amounts) |
| P2 profile | Done + verified (labeled Name/Email/Phone with "Not set", visible Language label, VoiceOver-reachable FR/EN radios, human back label, sign-out last) |
| P2 sheet sizing | Done + verified (pay picker is a fitToContents formSheet; create/join sheet content-fit with full-width buttons via SwiftUI label frame) |
| Dev overlay caveat | DEV·PILOT pill moved to bottom-right (it was intercepting the avatar and Groups "+") |

## Notable decisions

- **Payee phone now comes from `rounds.getRound.payeeContact`** (additive
  field), NOT from `memberships.listMembers` — the roster phone projection is
  officer-gated (04 §B), which silently disabled mobile money for every plain
  member. Only the viewer's single payee contact is exposed.
- Operator ranges live in pure, tested `convex/lib/paymentMethods.ts`
  (MTN 650–654/67x/680–684, Orange 655–659/685–689/69x; re-verify quarterly
  with the USSD copy).
- `serve-sim` gestures require **normalized 0..1 coords** (`serve-sim tap x y`)
  and phased `begin/move/end` JSON; the README pixel format is a silent no-op.
- New dev harness mutation `dev:devSetMembershipPhone` (DEV_SEED_ENABLED-guarded)
  patches mock members' phones to exercise gating states.

## Open items

1. Tab-item flash: verify on a release build + physical device (iOS 18.6 and 26.x).
2. USSD "I've sent it → Declare" claim submission was deliberately not exercised
   (non-mutating review); covered by the existing pilot runbook instead.
3. French-locale sweep of the new copy (keys exist and parity-linted; not
   visually reviewed).
