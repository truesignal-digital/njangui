# Mock Group Pilot Design

**Date:** 2026-07-09  
**Status:** Approved direction  
**Objective:** Prove that Njangi can safely operate one realistic group through its core réunion lifecycle before recruiting a real pilot group.

## Product decision

The next milestone is not broader MVP completion. It is a repeatable simulated pilot that demonstrates that the core ledger is trustworthy, understandable, and recoverable under realistic meeting conditions.

The pilot validates technical and workflow readiness. It cannot validate adoption, willingness to pay, or whether a real group prefers Njangi to WhatsApp and its notebook. Those questions remain for the first field pilot.

## Pilot group

The fixture is **Njangi Solidarité**, a 15-person monthly group:

- President: Alice Mballa, smartphone account
- Treasurer: Marie Ngono, smartphone account
- Eight additional smartphone members
- Five feature-phone members represented through officer-operated records
- Contribution: 10,000 FCFA per member per round
- Collection mode: treasurer-mediated
- Payment mix: cash, MTN MoMo, and Orange Money
- Primary language: French, with several English-speaking members
- Beneficiary contributes to their own round

Only the president, treasurer, and one ordinary smartphone member need independently controllable test identities. The remaining members can be deterministic fixture records.

## Four compressed rounds

### Round 1 — normal operation

Exercise the expected path: open the round, record cash through Meeting Mode, submit member-side MoMo claims, confirm contributions, claim and confirm the payout, inspect the activity history, and share the round summary.

### Round 2 — unreliable connectivity

Record 15 rapid Meeting Mode taps while connectivity is degraded, terminate the app during synchronization, reopen it, replay the queue, and verify that every intended action appears exactly once.

### Round 3 — exceptions

Exercise a partial payment, a late payment, a member claim colliding with a treasurer tap, a disputed claim, withdrawal, resolution, and remaining arrears.

### Round 4 — governance

Exercise a mistaken entry that has already been confirmed, an auditable presidential correction, a future rotation change, and a treasurer handover. Pending obligations move to the new treasurer; claimed, disputed, and confirmed history stays attributed to the original parties.

## Core data flow

1. The development fixture creates the group, memberships, draft cycle, and deterministic identities.
2. Development-only lifecycle controls advance time or invoke the real lifecycle paths; they do not introduce a second implementation of round logic.
3. Production screens invoke the existing public Convex API.
4. Meeting Mode persists an action before optimistic feedback is allowed to imply durability.
5. Convex mutations apply authorization, idempotency, and state-machine rules transactionally.
6. Reactive queries reconcile local optimistic state with the server record.
7. Activity events and immutable correction artifacts make the resulting history inspectable.
8. Scenario assertions compare the final database state with the expected ledger.

## Correctness invariants

- Fifteen intended taps produce exactly fifteen intended ledger effects.
- A retry or replay never creates a duplicate effect.
- The app never presents an action as durable until it is stored locally or acknowledged remotely.
- A terminal server rejection is visible and actionable; it is not silently discarded.
- Confirmed history is never destructively edited. Corrections append an attributed artifact and update the effective state through the approved correction path.
- Treasurer handover changes only pending obligations.
- Feature-phone participation cannot deadlock a round.
- No screen implies that Njangi possesses or transfers member money.

## Error handling

Meeting Mode exposes four explicit states: saved on this phone, synchronizing, recorded, and needs attention. Network failures stay queued. Terminal state conflicts leave the queue and surface a human-readable recovery action. Queue persistence is serialized per round so concurrent read-modify-write operations cannot overwrite one another.

Scenario controls are development-only and refuse to run unless the existing `DEV_SEED_ENABLED` deployment guard is enabled. Resetting the fixture is explicit and never available in production.

## Test strategy

### Pure tests

Retain the existing state-machine and calendar-math suites.

### Convex integration tests

Add `convex-test` coverage for:

- authentication and role authorization;
- claim, confirmation, dispute, cancellation, and correction;
- idempotent retries and conflicting claims;
- cron-driven auto-confirm and auto-dispute;
- round opening, closing, payout completion, and arrears;
- treasurer reassignment and rotation changes;
- former-member read access and cross-group denial.

### Client durability tests

Test serialized enqueue/dequeue behavior, 15 concurrent taps, interrupted writes, replay, and confirmation-action persistence.

### Simulator evidence

Run each scenario on a native simulator. For the unreliable-connectivity round, terminate and relaunch the app during the queue drain. Record duration, queued count, final record count, duplicate count, unresolved actions, and screenshots of recovery states.

## UI design gate

No production UI change proceeds directly from an observation.

1. Record the observed usability problem.
2. Produce a low-fidelity mockup showing the proposed states and copy.
3. Obtain user approval.
4. Implement the approved version.
5. Verify it in the simulator against the relevant scenario.

Expected mockups are:

- Meeting Mode synchronization and recovery states;
- confirmed-record correction and mandatory-reason confirmation;
- treasurer handover statement and consequences;
- any pilot usability issue discovered during the scenario runs.

The development-only pilot console also receives a mockup before implementation, even though it is not production UI.

## Pass criteria

- No acknowledged Meeting Mode entry is lost or duplicated.
- A treasurer can record 15 members in under two minutes.
- Every ledger change has understandable attribution and history.
- Every erroneous entry has a safe, auditable correction path.
- Payout and custody language never implies that Njangi holds money.
- Feature-phone members never block completion.
- A first-time member can identify the current round and their required action without explanation.
- The core lifecycle is protected by Convex integration tests.
- All existing type, domain-test, and design-lint checks remain green.

## Execution order

1. Serialize Meeting Mode persistence and persist confirmation actions.
2. Establish the Convex integration-test harness.
3. Implement and test confirmed-record correction and treasurer handover semantics.
4. Create the deterministic 15-member fixture and compressed lifecycle controls.
5. Mock up and implement the development pilot console.
6. Run Round 1 and mock up only the production UI problems it exposes.
7. Run Rounds 2–4, fixing release blockers between runs.
8. Produce a pilot-readiness report separating blockers, accepted limitations, and post-pilot work.

## Explicitly deferred

- manual fines and assistance levies;
- portable reliability scoring;
- subscriptions and billing;
- broad visual redesign;
- additional group formats;
- recruitment of multiple pilot groups.

These do not begin until the simulated pilot passes and a real first-group recruitment plan is approved.
