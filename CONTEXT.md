# Njangi Ledger

Custody-free ledger for rotating savings groups (njangis) in Cameroon. The app schedules rounds, records two-sided payment acknowledgments, and never moves money.

## Product language

**Group**:
The user-facing home for people coordinating money around one purpose. A Group has exactly one mode: a one-time Contribution group or a recurring Njangi group. Both modes appear together in the Groups tab, but they keep separate lifecycle rules.
_Avoid_: using group as if it implied a recurring njangi

**Contribution group**:
A one-time Group for a funeral, wedding, birthday, family need, school, church, business, trip, gift, association, or another named purpose. Contributors pay the disclosed recipient directly and record the contribution in OnCotise.
_Avoid_: Gathering (already means a njangi meeting), campaign, fundraiser, pool

**Njangi group**:
A recurring Group with membership, roles, cycles, rounds, contributions, and pot handovers.
_Avoid_: treating a Njangi group as a generic one-time collection

**Purpose tag**:
The single localized label shown beside a Group name to explain why the group exists. Purpose tags support recognition and analytics; they never change custody or ledger rules.
_Avoid_: category list, hashtags, multiple tags

## Language

**PaymentRecord**:
A two-sided acknowledgment of one money movement between two memberships.
_Avoid_: payment, transaction, transfer

**Claim**:
The first-side assertion on a PaymentRecord — payer-side ("j'ai envoyé") or payee-side (Meeting Mode roll-call / payout received).
_Avoid_: log, report, declare

**Confirm**:
The counterparty's acknowledgment that closes the handshake; truth = payee confirmation. Only a claimed record can be confirmed.
_Avoid_: approve, validate

**Disbursement**:
A round-independent PaymentRecord from the treasurer to a recipient — refunds, family settlements, assistance hand-overs.
_Avoid_: payout (reserved for the round beneficiary), transfer

**Draft cycle**:
A cycle whose rotation order is still being arranged; it becomes a real, locked cycle only when the president starts it.
_Avoid_: pre-cycle, setup order

**Lock**:
The president's one-time act that fixes a draft cycle's rotation order, makes it public, and starts the cycle.
_Avoid_: activate, finalize, start (when the actor matters)

**Self-record**:
A PaymentRecord whose payer and payee are the same membership; the holder's claim confirms it immediately, with no timers and no counterparty step.
_Avoid_: auto-record, treasurer record

**Attention action**:
A viewer-relative, non-authoritative description of one useful next step the viewer can perform now. It is derived from canonical ledger and governance state and is never completed directly.
_Avoid_: task row, notification, persisted to-do

**Waiting fact**:
A viewer-relative explanation that the next transition belongs to another person or a scheduled event. Waiting facts never become the primary Attention action and never count toward the Actions badge.
_Avoid_: blocked task, disabled action

## Relationships

- A **Claim** by one side obligates the other side to **Confirm** (or dispute) the **PaymentRecord**
- A **Self-record** has exactly one party and skips **Confirm** entirely
- An **Attention action** points to the canonical screen where a domain transition can be attempted; the authoritative mutation revalidates it
- A **Waiting fact** explains why no action is currently available without pretending that the viewer owns the next transition

## Example dialogue

> **Dev:** "Can a treasurer **Confirm** their own contribution?"
> **Domain expert:** "No — that's a **Self-record**. Their **Claim** is the whole handshake; there is nothing left to confirm."

## Flagged ambiguities

- `confirm()` was reachable on a pending **Self-record**, implying confirm was an alternate entry point — resolved: **Claim** is the only entry point for a Self-record; confirm applies exclusively to claimed records.
- "The creator administers the group during setup" was read as letting a treasurer-creator perform the **Lock** — resolved: administering setup does not include the Lock; only the president locks.
- Treasurer reassignment "re-points open records" was ambiguous about which states — resolved: only pending records move to the new treasurer; claimed/disputed/confirmed keep the old treasurer as payee (truth = payee confirmation).
