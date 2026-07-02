import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx, query } from './_generated/server';
import {
  computePotProgress,
  expectedContributionAmount,
  freezeObligationStatus,
  handsByMembership,
} from './lib/roundMath';
import {
  collectionModeValidator,
  obligationStatusValidator,
  paymentMethodValidator,
  paymentSideValidator,
  paymentStateValidator,
  proofTypeValidator,
  roundStatusValidator,
} from './schema';
import { logActivityEvent } from './utils/activity';
import { getCurrentUserOrNull, requireMembership } from './utils/auth';

// ============================================================================
// Shared helpers — exported for reuse by cycles.ts / paymentRecords.ts /
// crons.ts (one source of truth for round advancement; helpers never throw
// on stale data so a single bad round can never abort a whole cron tick).
// ============================================================================

/**
 * Ghost-reminder guard (01 §3.1 rounds): every round cron action verifies
 * group `active` AND cycle `active` before acting — `paused`/`archived`
 * groups and cancelled cycles are never cron-visible (02 §a: paused freezes
 * round timers; record-level timers keep running elsewhere).
 */
/**
 * A member's expected contribution for one round, hands-aware (02 §b
 * « deux mains ») — the single source every freeze/summary/remainder
 * computation must use. Derived from the immutable cycle snapshot
 * (rotationOrder + contributionAmount + beneficiaryContributes), so it is
 * stable for the round's whole life.
 */
export function expectedForMember(
  cycle: Doc<'cycles'>,
  round: Doc<'rounds'>,
  membershipId: Id<'memberships'>
): number {
  return expectedContributionAmount({
    hands: handsByMembership(cycle.rotationOrder).get(membershipId) ?? 0,
    isBeneficiary: membershipId === round.beneficiaryMembershipId,
    beneficiaryContributes: cycle.beneficiaryContributes,
    contributionAmount: cycle.contributionAmount,
  });
}

export async function loadActiveRoundContext(
  ctx: MutationCtx,
  round: Doc<'rounds'>
): Promise<{ group: Doc<'groups'>; cycle: Doc<'cycles'> } | null> {
  const cycle = await ctx.db.get(round.cycleId);
  const group = await ctx.db.get(round.groupId);
  if (
    !cycle ||
    !group ||
    cycle.status !== 'active' ||
    group.status !== 'active'
  ) {
    return null;
  }
  return { group, cycle };
}

/**
 * Cycle completion (02 §a): when the final round reaches a terminal state
 * (`completed`, or `cancelled` for removed positions), the cycle completes
 * and the group moves to `between_cycles`. Idempotent.
 */
export async function completeCycleIfFinished(
  ctx: MutationCtx,
  cycleId: Id<'cycles'>
): Promise<void> {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle || cycle.status !== 'active') {
    return;
  }

  const rounds = await ctx.db
    .query('rounds')
    .withIndex('by_cycle', (q) => q.eq('cycleId', cycleId))
    .collect();
  if (rounds.length === 0) {
    return;
  }
  if (
    !rounds.every((r) => r.status === 'completed' || r.status === 'cancelled')
  ) {
    return;
  }

  await ctx.db.patch(cycle._id, {
    status: 'completed',
    completedAt: Date.now(),
  });
  await logActivityEvent(ctx, {
    groupId: cycle.groupId,
    kind: 'cycle_completed',
    entityTable: 'cycles',
    entityId: cycle._id,
    fromState: 'active',
    toState: 'completed',
  });

  // 02 §a diagram: active → between_cycles is the only legal group edge here.
  // A paused group keeps its state; the resume flow reconciles.
  const group = await ctx.db.get(cycle.groupId);
  if (group && group.status === 'active') {
    await ctx.db.patch(group._id, { status: 'between_cycles' });
    await logActivityEvent(ctx, {
      groupId: group._id,
      kind: 'group_status_changed',
      entityTable: 'groups',
      entityId: group._id,
      fromState: 'active',
      toState: 'between_cycles',
    });
  }
}

/**
 * `payout → completed` (02 §b): called by the payout-record confirmation
 * paths. Rounds still `open`/`grace` when the payout confirms early need
 * nothing — close sees the confirmed payout and completes directly.
 */
export async function settleRoundAfterPayoutConfirmed(
  ctx: MutationCtx,
  roundId: Id<'rounds'>
): Promise<void> {
  const round = await ctx.db.get(roundId);
  if (!round || round.status !== 'payout') {
    return;
  }
  await ctx.db.patch(round._id, {
    status: 'completed',
    completedAt: Date.now(),
  });
  await logActivityEvent(ctx, {
    groupId: round.groupId,
    kind: 'round_completed',
    entityTable: 'rounds',
    entityId: round._id,
    fromState: 'payout',
    toState: 'completed',
  });
  await completeCycleIfFinished(ctx, round.cycleId);
}

async function getActiveGroupMemberships(
  ctx: MutationCtx,
  groupId: Id<'groups'>
): Promise<Doc<'memberships'>[]> {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return memberships.filter((m) => m.status === 'active');
}

/**
 * `scheduled → open` (02 §b opening rules). On open, the system creates the
 * round's PaymentRecords in `pending`:
 * - one `contribution` per active member excluding `joinedMidCycle` members
 *   (edge case 4 — this guard is what keeps round-open from billing them)
 *   and the beneficiary when the cycle snapshot has
 *   `beneficiaryContributes: false`. Payee = current treasurer
 *   (`via_treasurer`) or the round's beneficiary (`direct_to_beneficiary`).
 * - in `via_treasurer` mode only: one `payout` record (payer = treasurer,
 *   payee = beneficiary), amount PREFILLED at obligated members ×
 *   contribution per 05 M8 / 01 §3.1 — treasurer-editable at claim time.
 * Self-records (payer = payee) are created `pending` like everything else;
 * the self-record rule fires at claim (02 §c: single mutation
 * pending → confirmed, no timers).
 * This pre-creation is what powers the Meeting Mode roll-call list.
 * Returns true when the round was opened; idempotent.
 */
export async function openRoundForTick(
  ctx: MutationCtx,
  roundId: Id<'rounds'>
): Promise<boolean> {
  const round = await ctx.db.get(roundId);
  if (!round || round.status !== 'scheduled') {
    return false; // idempotent — already open, or terminal
  }
  const context = await loadActiveRoundContext(ctx, round);
  if (!context) {
    return false;
  }
  const { cycle } = context;

  const activeMembers = await getActiveGroupMemberships(ctx, round.groupId);
  const beneficiary = activeMembers.find(
    (m) => m._id === round.beneficiaryMembershipId
  );
  if (!beneficiary) {
    // Exited/deceased beneficiary whose round was not yet removed via an
    // OrderChange (02 edges 1–2) — never open it; the president must act.
    return false;
  }

  const treasurer = activeMembers.find((m) => m.role === 'treasurer');
  if (cycle.collectionMode === 'via_treasurer' && !treasurer) {
    return false; // I-2 broken — refuse rather than mint records with no payee
  }

  // Idempotency: a partially-failed earlier open never double-creates rows.
  const existing = await ctx.db
    .query('paymentRecords')
    .withIndex('by_round', (q) => q.eq('roundId', round._id))
    .take(1);

  if (existing.length === 0) {
    // Per-member obligation = base amount × hands held in the locked
    // rotation (02 §b « deux mains »); the beneficiary's benefiting hand
    // rests when the cycle says so. 0 ⇒ no record (single-hand beneficiary
    // sitting out — exactly the old exclusion).
    const hands = handsByMembership(cycle.rotationOrder);
    const contributionPayeeId =
      cycle.collectionMode === 'via_treasurer'
        ? (treasurer as Doc<'memberships'>)._id
        : round.beneficiaryMembershipId;

    let potPrefill = 0;
    for (const member of activeMembers) {
      if (member.joinedMidCycle === true) continue;
      const amount = expectedContributionAmount({
        hands: hands.get(member._id) ?? 0,
        isBeneficiary: member._id === round.beneficiaryMembershipId,
        beneficiaryContributes: cycle.beneficiaryContributes,
        contributionAmount: cycle.contributionAmount,
      });
      if (amount <= 0) continue;
      potPrefill += amount;
      await ctx.db.insert('paymentRecords', {
        groupId: round.groupId,
        roundId: round._id,
        kind: 'contribution',
        state: 'pending',
        amount,
        payerMembershipId: member._id,
        payeeMembershipId: contributionPayeeId,
        proofType: 'none', // method absent until claimed (02 §b pre-creation)
      });
    }

    if (cycle.collectionMode === 'via_treasurer') {
      await ctx.db.insert('paymentRecords', {
        groupId: round.groupId,
        roundId: round._id,
        kind: 'payout',
        state: 'pending',
        amount: potPrefill, // Σ of the hands-adjusted obligations just minted
        payerMembershipId: (treasurer as Doc<'memberships'>)._id,
        payeeMembershipId: round.beneficiaryMembershipId,
        proofType: 'none',
      });
    }
  }

  await ctx.db.patch(round._id, { status: 'open', openedAt: Date.now() });
  // Notification copy (02 §b): "Round {n} ouvert — {amount} FCFA pour
  // {beneficiaryName}, échéance {date}" — push pipeline ships Week 3.
  await logActivityEvent(ctx, {
    groupId: round.groupId,
    kind: 'round_opened',
    entityTable: 'rounds',
    entityId: round._id,
    fromState: 'scheduled',
    toState: 'open',
    note: beneficiary.displayName,
  });
  return true;
}

/**
 * `grace → closed` (02 §b closing rules — SYSTEM-driven at `graceEndAt`,
 * no human gate; earlier only when every contribution record is already
 * terminal). Implements closing rules 1–3 and 5; rule 4 (fine
 * auto-proposals) is L2 and deliberately excluded — MVP fines are manual
 * (05 M14):
 * 1. freezes per-member obligation statuses (written EXACTLY ONCE);
 * 2. flags surviving `pending` contributions `isArrears: true` (open
 *    indefinitely, claimable weeks later);
 * 3. `claimed` records keep their own anchored timers — the round never
 *    waits for them;
 * 5. posts the round-closed feed event (the shareable summary is Week 5).
 * Then advances: `direct_to_beneficiary` or payout-already-confirmed →
 * `completed` (and possibly completes the cycle); otherwise → `payout`.
 * Returns true when the round closed; idempotent.
 */
export async function closeRoundForTick(
  ctx: MutationCtx,
  roundId: Id<'rounds'>
): Promise<boolean> {
  const round = await ctx.db.get(roundId);
  if (!round || round.status !== 'grace') {
    return false; // idempotent — already closed, or not yet in grace
  }
  const context = await loadActiveRoundContext(ctx, round);
  if (!context) {
    return false;
  }
  const { cycle } = context;

  const records = await ctx.db
    .query('paymentRecords')
    .withIndex('by_round', (q) => q.eq('roundId', round._id))
    .collect();
  const contributions = records.filter((r) => r.kind === 'contribution');

  const now = Date.now();
  const allContributionsTerminal =
    contributions.length > 0 &&
    contributions.every(
      (r) => r.state === 'confirmed' || r.state === 'cancelled'
    );
  if (round.graceEndAt > now && !allContributionsTerminal) {
    return false;
  }

  // Closing rule 1 — freeze obligation statuses, measured on claimedAt.
  // Obligated members = distinct payers holding at least one non-cancelled
  // contribution record (fully-cancelled obligations are void — exits).
  const recordsByPayer = new Map<Id<'memberships'>, typeof contributions>();
  for (const record of contributions) {
    const list = recordsByPayer.get(record.payerMembershipId) ?? [];
    list.push(record);
    recordsByPayer.set(record.payerMembershipId, list);
  }
  const obligationStatuses: {
    membershipId: Id<'memberships'>;
    status: ReturnType<typeof freezeObligationStatus>;
  }[] = [];
  for (const [membershipId, memberRecords] of recordsByPayer) {
    if (memberRecords.every((r) => r.state === 'cancelled')) {
      continue;
    }
    obligationStatuses.push({
      membershipId,
      status: freezeObligationStatus(
        memberRecords.map((r) => ({
          state: r.state,
          amount: r.amount,
          claimedAt: r.claimedAt,
        })),
        expectedForMember(cycle, round, membershipId),
        round.dueAt
      ),
    });
  }

  await ctx.db.patch(round._id, {
    status: 'closed',
    closedAt: now,
    ...(round.obligationStatuses === undefined && { obligationStatuses }), // written exactly once
  });

  // Closing rule 2 — stragglers: surviving pendings become arrears, NOT cancelled.
  for (const record of contributions) {
    if (record.state === 'pending' && record.isArrears !== true) {
      await ctx.db.patch(record._id, { isArrears: true });
    }
  }

  // Closing rule 5 — feed entry (WhatsApp-shareable summary is Week 5).
  await logActivityEvent(ctx, {
    groupId: round.groupId,
    kind: 'round_closed',
    entityTable: 'rounds',
    entityId: round._id,
    fromState: 'grace',
    toState: 'closed',
  });

  // closed → payout | completed (02 §b).
  const payout = records.find(
    (r) => r.kind === 'payout' && r.state !== 'cancelled'
  );
  if (
    cycle.collectionMode === 'direct_to_beneficiary' ||
    payout?.state === 'confirmed'
  ) {
    await ctx.db.patch(round._id, { status: 'completed', completedAt: now });
    await logActivityEvent(ctx, {
      groupId: round.groupId,
      kind: 'round_completed',
      entityTable: 'rounds',
      entityId: round._id,
      fromState: 'closed',
      toState: 'completed',
    });
    await completeCycleIfFinished(ctx, round.cycleId);
  } else {
    await ctx.db.patch(round._id, { status: 'payout' });
    await logActivityEvent(ctx, {
      groupId: round.groupId,
      kind: 'round_payout_pending',
      entityTable: 'rounds',
      entityId: round._id,
      fromState: 'closed',
      toState: 'payout',
    });
  }
  return true;
}

/**
 * 02 §b closing rule 1's provisional-status rule: statuses freeze at close
 * measured on claimedAt, but records in flight at close (`claimed`/
 * `disputed`) finalize later — their resolution must update the frozen
 * entry (cancellations downgrade, dispute resolutions finalize). Records
 * FIRST CLAIMED AFTER close (arrears settlements) never improve the frozen
 * status: the round's history is what it was at the réunion. Recomputes
 * one payer's entry from current records; no-op before close or when
 * nothing changed.
 */
export async function refreezeObligationStatus(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<void> {
  if (record.kind !== 'contribution' || record.roundId === undefined) {
    return;
  }
  const round = await ctx.db.get(record.roundId);
  if (
    !round ||
    round.obligationStatuses === undefined ||
    round.closedAt === undefined ||
    (round.status !== 'closed' &&
      round.status !== 'payout' &&
      round.status !== 'completed')
  ) {
    return; // not closed yet — closeRoundForTick owns the initial freeze
  }
  const closedAt = round.closedAt;
  const entryIndex = round.obligationStatuses.findIndex(
    (e) => e.membershipId === record.payerMembershipId
  );
  if (entryIndex === -1) {
    return; // obligation was void at close (fully cancelled — exits own these)
  }

  const siblings = await ctx.db
    .query('paymentRecords')
    .withIndex('by_round_and_kind', (q) =>
      q.eq('roundId', round._id).eq('kind', 'contribution')
    )
    .collect();
  const atCloseRecords = siblings.filter(
    (r) =>
      r.payerMembershipId === record.payerMembershipId &&
      (r.claimedAt === undefined || r.claimedAt <= closedAt)
  );

  const obligationStatuses = [...round.obligationStatuses];
  const current = obligationStatuses[entryIndex].status;
  if (
    atCloseRecords.length > 0 &&
    atCloseRecords.every((r) => r.state === 'cancelled')
  ) {
    // The obligation became void after close (e.g. an exited member's
    // withdrawn claim with no arrears re-creation) — drop the entry,
    // matching the at-close rule for fully-cancelled obligations.
    obligationStatuses.splice(entryIndex, 1);
  } else {
    const cycle = await ctx.db.get(round.cycleId);
    const next = freezeObligationStatus(
      atCloseRecords.map((r) => ({
        state: r.state,
        amount: r.amount,
        claimedAt: r.claimedAt,
      })),
      cycle
        ? expectedForMember(cycle, round, record.payerMembershipId)
        : round.expectedAmountPerMember,
      round.dueAt
    );
    if (next === current) {
      return;
    }
    obligationStatuses[entryIndex] = {
      membershipId: record.payerMembershipId,
      status: next,
    };
  }

  await ctx.db.patch(round._id, { obligationStatuses });
  await logActivityEvent(ctx, {
    groupId: round.groupId,
    kind: 'obligation_status_finalized',
    entityTable: 'rounds',
    entityId: round._id,
    fromState: current,
    toState:
      obligationStatuses.find(
        (e) => e.membershipId === record.payerMembershipId
      )?.status ?? 'void',
  });
}

// ============================================================================
// Internal mutations — the cron tick (convex/crons.ts) and dashboard ops
// drive these; there is no human round-open/close gate (02 §b).
// ============================================================================

export const openRound = internalMutation({
  args: {
    roundId: v.id('rounds'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await openRoundForTick(ctx, args.roundId);
  },
});

export const closeRound = internalMutation({
  args: {
    roundId: v.id('rounds'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await closeRoundForTick(ctx, args.roundId);
  },
});

// ============================================================================
// Reusable return type validators
// ============================================================================

const payoutSummaryValidator = v.object({
  paymentRecordId: v.id('paymentRecords'),
  state: paymentStateValidator,
  amount: v.number(),
  claimedAt: v.optional(v.number()),
  confirmedAt: v.optional(v.number()),
});

const roundDetailValidator = v.object({
  roundId: v.id('rounds'),
  cycleId: v.id('cycles'),
  groupId: v.id('groups'),
  viewerMembershipId: v.id('memberships'), // "my row" lookup without a second query
  index: v.number(),
  status: roundStatusValidator,
  collectionMode: collectionModeValidator,
  beneficiaryMembershipId: v.id('memberships'),
  beneficiaryName: v.string(),
  custodianName: v.string(), // who receives contributions — custody framing (00 red line)
  scheduledOpenAt: v.number(),
  dueAt: v.number(),
  graceEndAt: v.number(),
  expectedAmountPerMember: v.number(),
  expectedTotal: v.number(), // obligated contributors × expected — pot denominator
  confirmedTotal: v.number(), // sum of confirmed contributions — the only ledger-final money
  inFlightTotal: v.number(), // claimed + disputed contributions
  payout: v.union(v.null(), payoutSummaryValidator), // null in direct mode / before open
  obligationStatuses: v.optional(
    v.array(
      v.object({
        membershipId: v.id('memberships'),
        status: obligationStatusValidator,
      })
    )
  ),
});

const memberPaymentRecordValidator = v.object({
  paymentRecordId: v.id('paymentRecords'),
  state: paymentStateValidator,
  amount: v.number(),
  method: v.optional(paymentMethodValidator),
  proofType: proofTypeValidator,
  claimedBySide: v.optional(paymentSideValidator),
  isArrears: v.optional(v.boolean()),
  claimedAt: v.optional(v.number()),
  confirmedAt: v.optional(v.number()),
  disputedAt: v.optional(v.number()),
});

const memberPaymentRowValidator = v.object({
  membershipId: v.id('memberships'),
  displayName: v.string(),
  expectedAmount: v.number(),
  confirmedAmount: v.number(),
  inFlightAmount: v.number(),
  hasOpenDispute: v.boolean(),
  isSettled: v.boolean(), // confirmed sum ≥ expected (02 §e7)
  records: v.array(memberPaymentRecordValidator),
});

// ============================================================================
// Queries — member-scoped reads powering the round card UI
// ============================================================================

/**
 * Round detail: status, beneficiary, pot progress, payout status. Every
 * member of the group sees it (decision 6: who-paid-who-when visible to all).
 */
export const getRound = query({
  args: {
    roundId: v.id('rounds'),
  },
  returns: v.union(v.null(), roundDetailValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return null;
    }
    const round = await ctx.db.get(args.roundId);
    if (!round) {
      return null;
    }
    const { membership: viewer } = await requireMembership(ctx, round.groupId);

    const cycle = await ctx.db.get(round.cycleId);
    if (!cycle) {
      return null;
    }
    const beneficiary = await ctx.db.get(round.beneficiaryMembershipId);

    // Custody framing (00 red line): every pot figure names its holder —
    // the treasurer in via_treasurer mode, the beneficiary in direct mode.
    let custodianName = beneficiary?.displayName ?? '—';
    if (cycle.collectionMode === 'via_treasurer') {
      const memberships = await ctx.db
        .query('memberships')
        .withIndex('by_group', (q) => q.eq('groupId', round.groupId))
        .collect();
      const treasurer = memberships.find(
        (m) => m.role === 'treasurer' && m.status === 'active'
      );
      custodianName = treasurer?.displayName ?? custodianName;
    }

    const records = await ctx.db
      .query('paymentRecords')
      .withIndex('by_round', (q) => q.eq('roundId', round._id))
      .collect();
    const contributions = records.filter(
      (r) => r.kind === 'contribution' && r.state !== 'cancelled'
    );
    const pot = computePotProgress(
      contributions.map((r) => ({
        state: r.state,
        amount: r.amount,
        claimedAt: r.claimedAt,
      }))
    );
    // Σ per-payer expected (hands-aware) — never payers × base amount.
    const obligatedPayerIds = [
      ...new Set(contributions.map((r) => r.payerMembershipId)),
    ];
    const expectedTotal = obligatedPayerIds.reduce(
      (sum, id) => sum + expectedForMember(cycle, round, id),
      0
    );

    const payout = records.find(
      (r) => r.kind === 'payout' && r.state !== 'cancelled'
    );

    return {
      roundId: round._id,
      cycleId: round.cycleId,
      groupId: round.groupId,
      viewerMembershipId: viewer._id,
      index: round.index,
      status: round.status,
      collectionMode: cycle.collectionMode,
      beneficiaryMembershipId: round.beneficiaryMembershipId,
      beneficiaryName: beneficiary?.displayName ?? '—',
      custodianName,
      scheduledOpenAt: round.scheduledOpenAt,
      dueAt: round.dueAt,
      graceEndAt: round.graceEndAt,
      expectedAmountPerMember: round.expectedAmountPerMember,
      expectedTotal,
      confirmedTotal: pot.confirmedAmount,
      inFlightTotal: pot.inFlightAmount,
      payout: payout
        ? {
            paymentRecordId: payout._id,
            state: payout.state,
            amount: payout.amount,
            claimedAt: payout.claimedAt,
            confirmedAt: payout.confirmedAt,
          }
        : null,
      obligationStatuses: round.obligationStatuses,
    };
  },
});

/**
 * Per-member contribution rows for the round card / Meeting Mode roll-call:
 * status chips, sum-vs-expected, the member's individual records. Obligation
 * satisfied ⇔ confirmed sum ≥ expected (02 §e7 — multiple records per
 * member are normal).
 */
export const listRoundPayments = query({
  args: {
    roundId: v.id('rounds'),
  },
  returns: v.array(memberPaymentRowValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return [];
    }
    const round = await ctx.db.get(args.roundId);
    if (!round) {
      return [];
    }
    await requireMembership(ctx, round.groupId);
    const cycle = await ctx.db.get(round.cycleId);
    if (!cycle) {
      return [];
    }

    const contributions = await ctx.db
      .query('paymentRecords')
      .withIndex('by_round_and_kind', (q) =>
        q.eq('roundId', round._id).eq('kind', 'contribution')
      )
      .collect();

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', round.groupId))
      .collect();
    const nameByMembershipId = new Map(
      memberships.map((m) => [m._id, m.displayName])
    );

    const recordsByPayer = new Map<Id<'memberships'>, typeof contributions>();
    for (const record of contributions) {
      const list = recordsByPayer.get(record.payerMembershipId) ?? [];
      list.push(record);
      recordsByPayer.set(record.payerMembershipId, list);
    }

    const rows = [];
    for (const [membershipId, memberRecords] of recordsByPayer) {
      if (memberRecords.every((r) => r.state === 'cancelled')) {
        continue; // obligation void (exit) — no row
      }
      const pot = computePotProgress(
        memberRecords.map((r) => ({
          state: r.state,
          amount: r.amount,
          claimedAt: r.claimedAt,
        }))
      );
      const expectedAmount = expectedForMember(cycle, round, membershipId);
      rows.push({
        membershipId,
        displayName: nameByMembershipId.get(membershipId) ?? '—',
        expectedAmount,
        confirmedAmount: pot.confirmedAmount,
        inFlightAmount: pot.inFlightAmount,
        hasOpenDispute: memberRecords.some((r) => r.state === 'disputed'),
        isSettled: pot.confirmedAmount >= expectedAmount,
        records: memberRecords
          .sort((a, b) => a._creationTime - b._creationTime)
          .map((r) => ({
            paymentRecordId: r._id,
            state: r.state,
            amount: r.amount,
            method: r.method,
            proofType: r.proofType,
            claimedBySide: r.claimedBySide,
            isArrears: r.isArrears,
            claimedAt: r.claimedAt,
            confirmedAt: r.confirmedAt,
            disputedAt: r.disputedAt,
          })),
      });
    }

    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});
