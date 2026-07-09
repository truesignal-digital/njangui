# Mock Pilot Readiness Report

**Date:** 2026-07-09

**Scope:** Njangi Solidarité, 15-member simulated group

**Device:** iPhone 16 Pro Simulator, iOS 18.6

**Evidence base:** working tree based on `d5d9ce6`; this report ships with the pilot-hardening implementation

## Verdict

The simulated group pilot passes. The ledger-critical paths are ready for a supervised first-group trial: rapid meeting entry, offline persistence and replay, partial contributions, disputes, confirmed-record correction, treasurer handover, lifecycle advancement, custody-safe copy, and native sharing all completed without a release-blocking defect.

This result validates workflow and technical readiness. It does not validate real-group adoption, low-literacy comprehension, willingness to pay, or replacement of WhatsApp and the paper notebook.

## Automated evidence

| Check | Result |
|---|---:|
| Domain and durable-queue unit tests | 103 passed, 0 failed |
| Convex integration tests | 17 passed across 5 files |
| TypeScript | passed |
| Design-system lint | passed |
| Expo Doctor | 21/21 checks passed |
| Convex development deployment | deployed to `resolute-rooster-437` |

The automated scenarios cover authorization, idempotency, all 15 concurrent queue writes, interrupted replay, terminal versus transient failures, complete round and payout lifecycle, partial-payment arithmetic, dispute/withdrawal behavior, correction history, rotation governance, role handover, former-member access, and cross-group denial.

## Native simulator evidence

| Scenario | Intended actions | Observed result |
|---|---:|---|
| Round 1 — normal meeting | 15 Meeting Mode taps | 15 taps completed in 7.707 seconds; UI reached `15 entries recorded ✓`; the treasurer self-record confirmed and the other 14 remained declared for review. Native share sheet opened successfully. |
| Round 2 — unreliable network | 15 offline taps | 15 taps completed in 7.649 seconds; UI showed `15 entries saved on this phone`; after restoring the simulated network, the queue reached zero and UI showed `15 entries recorded ✓`. No unresolved action appeared. |
| Round 2 — process termination | 1 queued offline tap | Njangi was force-closed from the iOS app switcher, relaunched through the development build, and the persisted tap replayed to `1 entry recorded ✓`. The unit suite separately proves interruption of the full 15-entry drain retains exactly the unprocessed remainder. |
| Round 3 — exceptions | 4,000 F partial claim, collision, dispute | Member UI showed the 6,000 F remainder immediately. A treasurer Meeting Mode tap added only that remainder, keeping the obligation capped at 10,000 F. The original 4,000 F claim remained in the confirmation inbox and a wrong-amount dispute was opened with attributed detail. |
| Round 4 — correction | confirmed payment reversal | President-only correction required a reason, preserved the original confirmation time and rows, appended the president and note, visibly cancelled the old record, and recreated the obligation. |
| Round 4 — handover | Marie Ngono to Paul Nfor | Preview showed 15 pending contributions, 1 pending payout, active claims, and ledger custody. Handover updated the roster, round custody, governance card, and activity history while historical parties stayed unchanged. |
| Lifecycle controls | open, grace, payout | Development controls advanced the fixture through the production lifecycle paths and the visible round status updated correctly. |

## Usability findings resolved during the run

- Meeting Mode now distinguishes saved locally, synchronizing, recorded, and needs-attention states.
- Terminal synchronization conflicts link to the exact payment instead of disappearing or retrying forever.
- Confirmation copy now explains that history is permanent but a president can make an auditable correction.
- Treasurer handover explains what moves, what remains historical, where the register says cash is held, and that Njangi holds no funds.
- The development pilot console now provides deterministic P/T/M identities, four scenario descriptions, lifecycle controls, offline simulation, and direct routing into the newly seeded group after sign-in.
- The activity feed now renders president correction events with user-facing copy.

## Release blockers

No blocker remains for the simulated pilot or for beginning a supervised first-group trial.

Before unsupervised distribution, complete the existing launch gates that this simulation cannot prove:

1. Verify username/password recovery, Google return-to-app, and identity switching on the actual low-end Android pilot device.
2. Run the same meeting with a real treasurer and observe comprehension in French or Pidgin without coaching.
3. Confirm the pilot disclaimer and onboarding language with Cameroon counsel.

## Accepted pilot limitations

- Offline mode is a development-only Meeting Mode network simulator; a real radio-loss test on the target Android device is still required.
- Repeated development reseeds retain older isolated fixtures. The console remembers and routes into the newest fixture so they no longer confuse the active run.
- Feature-phone members are represented by officer-operated records and meeting/WhatsApp read-out; SMS remains post-pilot.
- Fines, assistance levies, portable reliability scoring, billing, exports, and broad visual redesign remain explicitly deferred.
- The native exception run stopped after opening the dispute; withdrawal, restored obligations, arrears, and close behavior are proven in Convex integration tests.

## Direction

Proceed with one supervised real-group pilot, keep the paper notebook in parallel, and record only release-blocking defects during the first meeting. Do not broaden scope until the group completes at least three rounds and the existing kill-signal metrics can be evaluated.
