# Njangi Ledger

Custody-free ledger for rotating savings groups (njangis) in Cameroon. The app schedules rounds, records two-sided payment acknowledgments, and never moves money.

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

## Relationships

- A **Claim** by one side obligates the other side to **Confirm** (or dispute) the **PaymentRecord**
- A **Self-record** has exactly one party and skips **Confirm** entirely

## Example dialogue

> **Dev:** "Can a treasurer **Confirm** their own contribution?"
> **Domain expert:** "No — that's a **Self-record**. Their **Claim** is the whole handshake; there is nothing left to confirm."

## Flagged ambiguities

- `confirm()` was reachable on a pending **Self-record**, implying confirm was an alternate entry point — resolved: **Claim** is the only entry point for a Self-record; confirm applies exclusively to claimed records.
- "The creator administers the group during setup" was read as letting a treasurer-creator perform the **Lock** — resolved: administering setup does not include the Lock; only the president locks.
- Treasurer reassignment "re-points open records" was ambiguous about which states — resolved: only pending records move to the new treasurer; claimed/disputed/confirmed keep the old treasurer as payee (truth = payee confirmation).
