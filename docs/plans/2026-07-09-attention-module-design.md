# Role-aware Attention Module

## Outcome

Njangi should answer three questions immediately:

1. What can I do now?
2. What am I waiting for?
3. What happens next?

The Attention Module derives those answers from canonical Membership, Round,
PaymentRecord, Claim, Confirm, Self-record, Draft cycle, and Lock state. It does
not introduce a persisted task system and never performs domain transitions.

## External Interface

The first version exposes one reactive Convex query:

```ts
readV1({
  scope:
    | { kind: 'viewer' }
    | { kind: 'group'; groupId: Id<'groups'> };
}): AttentionSnapshotV1
```

`AttentionSnapshotV1` contains:

- `actions`: globally and deterministically ordered Attention actions;
- `waiting`: waiting facts, separate from actionable work;
- `nextEvent`: the nearest relevant Round event;
- `badgeCount`: actionable work only;
- `truncated`: whether bounded source reads reached the pilot safety cap.

Today renders only `actions[0]` as the primary action. Actions renders the same
ordered collection. A Group workspace uses the same Interface with Group scope.

The Interface returns semantic facts and destinations. Localized copy, relative
time labels, and Expo route strings remain in the mobile Presentation Module and
Navigation Adapter.

## Initial action kinds

- Confirm PaymentRecords, aggregated into one user job per Group where possible
- Resolve one disputed PaymentRecord
- Record the viewer's contribution for a Round
- Run Meeting Mode for an open or grace Round
- Record or Confirm a payout handover
- Review pending Membership requests
- Assign a missing president
- Prepare a Draft cycle
- Lock a ready Draft cycle

Repeated routine rows are aggregated into one user job. High-consequence work,
such as a dispute, remains individual.

## Invariants

- Canonical domain rows remain the sole authority.
- An Attention action is never completed directly.
- Every action is executable by the current viewer at read time.
- The claimant never receives a Confirm action for their own Claim.
- A Self-record never produces a separate Confirm action.
- Capacity is derived per Group; there is no global role mode.
- Waiting facts never become the Today primary action or affect the badge.
- Ranking is owned by the server Implementation and is independent of locale.
- Mutations always reauthorize after navigation.
- Broken canonical invariants produce an unavailable result, never a false
  all-clear state.

## Ranking

The server sorts by consequence class, absolute deadline, source creation time,
then stable action ID. The initial consequence order is:

1. disputes and trust-threatening exceptions;
2. grace-period Meeting Mode work;
3. expiring Confirm work;
4. active meeting and payout operations;
5. personal contribution work;
6. Membership and cycle preparation;
7. routine governance.

The mobile Presentation Module may label an absolute deadline as overdue, today,
or soon, but it must not re-rank the server result.

## Implementation strategy

The pilot derives Attention live from bounded indexed reads. Internal rule
functions own eligibility, aggregation, stable IDs, ranking, and semantic
destinations. Existing authoritative mutations remain unchanged except where a
shared pure capability rule prevents authorization drift.

No Attention table, completion mutation, synchronization signal, or repair job
is introduced. If measured production traces later justify a persisted
projection, it can replace the live Implementation without changing `readV1`.

Push delivery remains outside this Interface. It can consume the same semantic
destinations later without becoming part of Attention ranking.

## Mobile presentation

The shared navigation shell will converge on Today, Groups, and Actions. The same
shell serves members, treasurers, and presidents; its content changes according
to each Group's viewer capacity.

Before screen code changes, produce and review a mockup showing:

- one primary action on Today;
- a compact count linking to remaining actions;
- a collapsed Waiting shelf;
- the next Round event;
- member, treasurer, and president variants.

The UI implementation will target stable Expo SDK 56 features: Expo Router native
tabs, Expo UI Universal controls where they reduce custom code, native Stack
headers and form sheets, and platform-native SwiftUI or Jetpack Compose only for
behavior the Universal Interface cannot express. Platform fallbacks remain
mandatory.

## Test surface

Convex tests exercise `readV1` for Claim/Confirm sides, Self-record exclusion,
per-Group capacity, deterministic ordering, aggregation, Group scoping,
duplicate Membership handling, bounded reads, and broken ledger invariants.

Mobile tests exercise the Presentation Module for a single Today primary,
waiting exclusion from badges, French and English copy, semantic navigation,
unknown Interface versions, and stale destination handling.
