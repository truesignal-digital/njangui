# Njangi — Build Plan & Working Process

How features get from the roadmap into `main`. Every feature passes through the
same loop; nothing skips the gate or the verify step.

## The working loop (per feature)

```
  ┌─ 1. GATE ─────────────────────────────────────────────────┐
  │  Judge panel decides: build THIS, NOW — or wait?          │
  │  Adversarial, default-skeptical, multi-round.             │
  │  Proposer states the case → judges object → rebuttal →    │
  │  re-judge. Repeat until consensus or a hard WAIT.         │
  └───────────────┬───────────────────────────────────────────┘
                  │ verdict = BUILD NOW
                  ▼
  2. BRANCH    git switch -c feat/<slug>   (off main)
                  ▼
  3. BUILD     one commit per chunk; small, reviewable
                  ▼
  4. VERIFY    tests green + typecheck + RUN the app and drive
               the feature end-to-end. No "looks done" — observed.
                  ▼
  5. SHIP      merge feat/<slug> → main (only after VERIFY passes)
                  ▼
              next feature → back to GATE
```

A feature is never built because it's "next on the list." It's built because
the panel could not find a reason to wait. If the panel says WAIT, the loop
does whatever it named first, then re-gates.

## Branch & commit conventions

- Branch per feature: `feat/<slug>` (or `fix/<slug>`). Off `main`, merged back to `main`.
- One commit per **chunk** (a chunk is a self-contained, typechecking, testable unit).
- Conventional commits; `Co-Authored-By` trailer.
- Merge to `main` only after VERIFY passes (tests + app driven).

## The gate — how judges decide "build now?"

A **proposer** makes the case for building feature X now, citing code + docs.
A panel of **judges** (diverse lenses, default skeptical) tries to refute it.
They must actually read the code to verify claims — not take the case at face value.

| Lens | The judge asks |
|------|----------------|
| Sequencing | Is anything more foundational unbuilt? Does this unblock the most? |
| Pilot value | Does this move a kill-signal / the 5-group pilot forward? |
| Readiness / risk | Is the backend really ready? Any unresolved blocker or correctness hole? |
| Opportunity cost | Is there a cheaper, higher-value item that should jump ahead? |

**Back-and-forth:** each round, dissenting judges file specific objections; the
proposer rebuts with evidence; judges re-evaluate. Up to 3 rounds. Outcome:

- **BUILD NOW** — panel converged; proceed to BRANCH with the chunk plan.
- **WAIT** — a blocker or higher-value item must come first; the loop does that, then re-gates.

## Roadmap (14 features, MVP-plan order)

| # | Feature | Size | Status | Branch |
|---|---------|------|--------|--------|
| 1 | Cycle-start UI (rotation builder + lock) + live rotation | M | gating | `feat/cycle-start-ui` |
| 2 | Round / claim contribution UI (+ USSD method screens) | L | queued | `feat/round-claim-ui` |
| 3 | Treasurer confirmation inbox | M | queued | `feat/treasurer-inbox` |
| 4 | Push notifications + in-app inbox | L | queued | `feat/push-inbox` |
| 5 | Meeting Mode (treasurer roll-call + offline queue) | L | queued | `feat/meeting-mode` |
| 6 | Payout flow UI | M | queued | `feat/payout-ui` |
| 7 | Activity feed (read/render) | M | queued | `feat/activity-feed` |
| 8 | Round summary + WhatsApp share | S | queued | `feat/round-summary` |
| 9 | Manual fine entry (M14) | M | queued | `feat/fines` |
| 10 | Assistance levy entry (M15) | M | queued | `feat/assistance-levy` |
| 11 | Reliability score v1 (M13) | M | queued | `feat/reliability-score` |
| 12 | Member exit / deceased handling | M | queued | `feat/member-exit` |
| 13 | Sign-out / profile screen | S | queued | `feat/profile-signout` |
| 14 | `disbursement` kind (code) — lands with #9/#10 | S | queued | (with fines/levy) |

Backend correctness items found in review/grill that the gate may pull forward:
- `confirmed → cancelled` president override has **no code path** (`LEGAL_TRANSITIONS.confirmed = []`); 02 transition 12 says it should exist. Decide before UI leans on the ledger.
- `reassignTreasurer` re-point + member exit/deceased mutations (deferred from Week 2).

## Detailed chunked todos

### Feature 1 — Cycle-start UI  `feat/cycle-start-ui`

Bridges the built engine to members. Backend is *mostly* ready (`startCycle`,
`getActiveCycle`, `getRound` exist); the grill decided the **draft rotation order
persists as a `draft` cycle row**, which is not built yet.

- **Chunk 1 — backend: draft order persistence**
  - `saveDraftOrder(groupId, rotationOrder)` mutation: upsert a `cycles` row with
    `status:'draft'` holding the working order (president/treasurer, group in `setup`/`between_cycles`).
  - `getDraftOrder(groupId)` query (or fold into `getActiveCycle` to also return a draft).
  - `startCycle` locks the existing draft (draft → active) after guards; keep arg-passed order as fallback.
  - Unit tests for the mutation guards; `tsc` + tests green.
- **Chunk 2 — frontend: setup-state rotation builder**
  - On setup-state group detail, replace the placeholder with a drag-to-order member list
    (default = join order), `🔀 Tirage au sort` shuffle → `saveDraftOrder`.
  - President-only `« Démarrer le cycle »` CTA → lock-confirm sheet → `startCycle`.
  - fr + en strings added together.
- **Chunk 3 — frontend: active-state rotation section**
  - Replace `app/(app)/groups/[groupId]/index.tsx:176` placeholder with the locked rotation
    order + current/next-round card via `getActiveCycle` + `getRound` (beneficiary, pot progress).
  - `🔒 fixé` badge + the locked-order explainer sheet.
- **Chunk 4 — verify**
  - Run the app: create group → set order → lock → see active rotation + round 1.
  - Confirm in Convex that the cycle locked and rounds materialized.

### Features 2–14 — outline chunks

Each gets its own gate before detailing; sketch only:

- **2 Round/claim UI:** (a) round screen reading `getRound`/`listRoundPayments`; (b) claim flow + method picker; (c) USSD screens (`*126#`/`#150#`, `tel:` deep link + copy fallback) + `ussdContent` seed/query; (d) verify.
- **3 Treasurer inbox:** (a) "awaiting my confirmation" query; (b) inbox screen, one-tap `confirm`; (c) verify.
- **4 Push + inbox:** (a) token-save + `users.pushTokens`; (b) Convex action → Expo push, hooked into cron + transitions; (c) in-app inbox screen; (d) verify.
- **5 Meeting Mode:** (a) roll-call screen from pre-created pendings, payee-side claim; (b) AsyncStorage offline tap queue + replay; (c) close-step read-out; (d) verify the 20-in-2-min + app-kill test.
- **6 Payout UI:** (a) reuse claim/confirm with sides swapped; (b) president on-behalf for feature-phone beneficiary; (c) verify.
- **7 Activity feed:** (a) paginated `activityEvents` query; (b) feed section + memoized cards; (c) verify.
- **8 Round summary:** (a) summary builder (fr/en text + `njangi://` link); (b) native share → `wa.me`; (c) verify.
- **9 Fines / 10 Levy / 14 disbursement:** (a) `disbursement` kind in validator + machine; (b) fine draft + president one-tap confirm; (c) levy launch form; (d) verify.
- **11 Reliability score:** (a) wire `reliabilityStats` counters at close/resolution; (b) score block UI; (c) verify.
- **12 Member exit/deceased:** (a) `markMemberExited`/`markMemberDeceased` + `reassignTreasurer` re-point; (b) member-detail actions; (c) verify.
- **13 Profile/sign-out:** (a) profile screen + sign-out; (b) settings edit; (c) verify.
