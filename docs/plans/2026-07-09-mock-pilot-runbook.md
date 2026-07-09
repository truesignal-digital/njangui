# Mock Pilot Runbook

This runbook is the executable companion to the [mock-group pilot design](./2026-07-09-mock-group-pilot-design.md). It separates automated proof from the native-simulator observations that still require the approved pilot console and UI.

## Start clean

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run lint:design
bun run doctor
```

Set `DEV_SEED_ENABLED=true` only on the development deployment. Never enable it on production.

## Round 1 — normal réunion

Automated proof:

```bash
bun run test:convex -- -t "Round 1"
```

The scenario creates Njangi Solidarité, opens the real first round, records 15 cash contributions through the treasurer identity, expires the normal objection window through the production cron path, closes the round, and completes the payout handshake.

Evidence required:

- 15 contribution obligations, all confirmed;
- one confirmed payout;
- exactly 16 payment records for the round;
- round status `completed`;
- activity history contains `round_opened`, claims, confirmations, `round_closed`, and `round_completed`.

Native observation after the pilot console is approved:

- time 15 Meeting Mode taps;
- verify every tap responds in under 100 ms visually;
- verify the round summary names the person holding the cash;
- share the summary through the native share sheet.

## Round 2 — unreliable connectivity

Automated proof:

```bash
bun run test:unit -- -t "durable queue"
```

Evidence required:

- 15 concurrent local writes remain present;
- duplicate replay keys collapse;
- interruption after seven processed entries retains exactly eight;
- replay produces 15 unique applied actions total;
- terminal conflicts leave the queue and transient network failures remain.

Native observation after sync UI approval:

1. Open Meeting Mode as the treasurer.
2. Disable connectivity.
3. Tap all 15 rows rapidly.
4. Confirm the UI says the entries are saved on the phone.
5. Terminate the app, relaunch, and restore connectivity.
6. Confirm the queue drains to zero with no duplicate ledger rows.

## Round 3 — exceptions

Automated proof:

```bash
bun run test:convex -- -t "partial wrong-amount"
```

Evidence required:

- a 4,000 F claim immediately creates a 6,000 F remainder;
- the treasurer can dispute the wrong amount;
- payer withdrawal cancels only the incorrect claim;
- two pending obligations of 4,000 F and 6,000 F restore the exact 10,000 F total.

Native observation:

- member claim collides with a treasurer Meeting Mode tap without double-counting;
- payment detail routes the user to the existing claim rather than creating another;
- dispute copy is understandable in both French and English;
- an arrears row remains actionable after round close.

## Round 4 — governance

Automated proof:

```bash
bun run test:convex -- -t "governance|correction|handover"
```

Evidence required:

- only the president can swap future turns;
- the immutable order-change artifact preserves the original decision trail;
- former members retain ledger read access and outsiders are denied;
- confirmed correction preserves `confirmedAt` and confirmation rows, appends one override, and recreates the obligation;
- final-payout correction safely reopens the round/cycle and refuses once a later cycle exists;
- treasurer handover moves pending contribution payees and pending payout payers only;
- claimed, disputed, and confirmed parties remain historical.

Native observation after correction/handover UI approval:

- the correction sheet communicates consequences before the destructive action;
- the corrected row remains visible and clearly struck/cancelled;
- the handover statement distinguishes future obligations from past claims;
- the custody line reads: « Espèces chez le trésorier (selon le registre) — l'application ne détient aucun fonds ».

## Evidence log

For each native run, record:

| Field | Value |
|---|---|
| Commit | |
| Device / OS | |
| Scenario | |
| Start / finish time | |
| Intended actions | |
| Final payment records | |
| Duplicate records | |
| Queue remaining | |
| Unresolved actions | |
| Screenshot paths | |
| Observed usability problems | |

Do not call the simulated pilot complete until all four automated scenarios pass and every native observation has direct evidence.
