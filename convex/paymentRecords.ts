import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query } from './_generated/server';
import {
  type Actor,
  counterpartySideOf,
  isSelfRecord,
  membershipIdForSide,
  type PaymentRecordSnapshot,
  type TransitionContext,
  validateTransition,
} from './lib/paymentStateMachine';
import { payoutPrefillAmount } from './lib/roundMath';
import {
  refreezeObligationStatus,
  settleRoundAfterPayoutConfirmed,
} from './rounds';
import {
  confirmationChannelValidator,
  disputeReasonValidator,
  disputeStatusValidator,
  overrideOutcomeValidator,
  paymentKindValidator,
  paymentMethodValidator,
  paymentSideValidator,
  paymentStateValidator,
  proofTypeValidator,
} from './schema';
import { logActivityEvent } from './utils/activity';
import { notifyMemberships } from './push';
import { getCurrentUserOrNull, requireMembership } from './utils/auth';

/** `10 000 F` — push copy uses the same paper-ledger format as the UI. */
function formatXAF(amount: number): string {
  return `${Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

// President-override notes are themselves ledger artifacts (01 §3.1
// presidentOverrides: mandatory, ≥ 10 chars, mutation-enforced).
const MIN_OVERRIDE_NOTE_LENGTH = 10;

// ============================================================================
// Reusable return type validators
// ============================================================================

const recordStateResultValidator = v.object({
  paymentRecordId: v.id('paymentRecords'),
  state: paymentStateValidator,
});

// ============================================================================
// Helpers
// ============================================================================

function toSnapshot(record: Doc<'paymentRecords'>): PaymentRecordSnapshot {
  return {
    state: record.state,
    kind: record.kind,
    payerMembershipId: record.payerMembershipId,
    payeeMembershipId: record.payeeMembershipId,
    claimedBySide: record.claimedBySide,
  };
}

/**
 * 02 §a: `archived` groups are read-only forever — every record write
 * refuses. Claims/confirms stay allowed while `paused` (arrears and late
 * contributions keep flowing during fêtes/crises).
 */
async function requireWritableGroup(
  ctx: MutationCtx,
  groupId: Id<'groups'>
): Promise<Doc<'groups'>> {
  const group = await ctx.db.get(groupId);
  if (!group || group.status === 'archived') {
    throw new Error('Group is archived — the ledger is read-only');
  }
  return group;
}

/**
 * Resolve the calling user to an ACTIVE membership in the record's group.
 * Former members keep read access only (utils/auth) — every paymentRecords
 * write requires an active membership; feature-phone/exited/deceased
 * parties act through the president on-behalf path (02 §c rows 4 & 6).
 */
async function requireActiveActor(
  ctx: MutationCtx,
  groupId: Id<'groups'>
): Promise<{ actor: Actor; membership: Doc<'memberships'> }> {
  const { membership } = await requireMembership(ctx, groupId);
  if (membership.status !== 'active') {
    throw new Error('Not a group member');
  }
  return {
    actor: {
      type: 'member',
      membershipId: membership._id,
      isPresident: membership.role === 'president',
    },
    membership,
  };
}

/**
 * 02 §c rows 4 & 6: the president may act on behalf ONLY of a counterparty
 * who cannot act for itself — hasAccount:false (no linked userId), exited,
 * or deceased.
 */
function needsRepresentation(membership: Doc<'memberships'> | null): boolean {
  if (!membership) {
    return false;
  }
  return (
    membership.userId === undefined ||
    membership.status === 'exited' ||
    membership.status === 'deceased'
  );
}

async function counterpartyOf(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<{
  membership: Doc<'memberships'> | null;
  context: TransitionContext;
}> {
  if (record.claimedBySide === undefined) {
    return { membership: null, context: {} };
  }
  const counterpartyId = membershipIdForSide(
    toSnapshot(record),
    counterpartySideOf(record.claimedBySide)
  ) as Id<'memberships'>;
  const membership = await ctx.db.get(counterpartyId);
  return {
    membership,
    context: {
      counterpartyNeedsRepresentation: needsRepresentation(membership),
    },
  };
}

/**
 * The expected amount behind a record's obligation. Payouts return null:
 * they are exempt from any expected-amount math — the treasurer-entered
 * amount is what was actually handed over (02 §b DECISION, 05 M8).
 */
async function expectedObligationAmount(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<number | null> {
  if (record.kind === 'contribution' && record.roundId !== undefined) {
    const round = await ctx.db.get(record.roundId);
    return round ? round.expectedAmountPerMember : null;
  }
  if (record.kind === 'fine' && record.fineId !== undefined) {
    const fine = await ctx.db.get(record.fineId);
    return fine ? fine.amount : null;
  }
  if (record.kind === 'assistance' && record.assistanceLevyId !== undefined) {
    const levy = await ctx.db.get(record.assistanceLevyId);
    return levy ? levy.amountPerMember : null;
  }
  return null;
}

/** All records (any state) sharing this record's obligation — same payer, same target. */
async function obligationSiblings(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<Doc<'paymentRecords'>[]> {
  if (record.kind === 'contribution' && record.roundId !== undefined) {
    const roundId = record.roundId;
    const rows = await ctx.db
      .query('paymentRecords')
      .withIndex('by_round_and_kind', (q) =>
        q.eq('roundId', roundId).eq('kind', 'contribution')
      )
      .collect();
    return rows.filter((r) => r.payerMembershipId === record.payerMembershipId);
  }
  if (record.kind === 'fine' && record.fineId !== undefined) {
    const fineId = record.fineId;
    return await ctx.db
      .query('paymentRecords')
      .withIndex('by_fine', (q) => q.eq('fineId', fineId))
      .collect();
  }
  if (record.kind === 'assistance' && record.assistanceLevyId !== undefined) {
    const levyId = record.assistanceLevyId;
    const rows = await ctx.db
      .query('paymentRecords')
      .withIndex('by_assistance_levy', (q) => q.eq('assistanceLevyId', levyId))
      .collect();
    return rows.filter((r) => r.payerMembershipId === record.payerMembershipId);
  }
  return [];
}

/**
 * Shortfall split (02 §c row 2, §e7) and cancellation re-creation (02 §c):
 * makes sure the un-asserted remainder of an obligation exists as a fresh
 * `pending` record, so an obligation is never silently lost. Idempotent —
 * skips when the sum of non-cancelled records already covers the expected
 * amount or the obligated membership is terminal. Remainders materialized
 * after round close carry `isArrears: true` (02 §b closing rule 2).
 */
async function ensureObligationRemainder(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<void> {
  const group = await ctx.db.get(record.groupId);
  if (!group || group.status === 'archived') {
    return; // archived ledgers never mint new obligations (defense in depth)
  }
  const payer = await ctx.db.get(record.payerMembershipId);
  if (!payer || payer.status !== 'active') {
    return; // terminal membership — the exit path owns these obligations (02 edges 1–3)
  }

  if (record.kind === 'payout') {
    // No expected-amount math for payouts: a withdrawn/cancelled payout
    // claim re-creates the single pending payout (row 8/10) unless one
    // already stands or the round no longer needs it.
    if (record.roundId === undefined) {
      return;
    }
    const roundId = record.roundId;
    const round = await ctx.db.get(roundId);
    if (
      !round ||
      round.status === 'cancelled' ||
      round.status === 'completed'
    ) {
      return;
    }
    const payouts = await ctx.db
      .query('paymentRecords')
      .withIndex('by_round_and_kind', (q) =>
        q.eq('roundId', roundId).eq('kind', 'payout')
      )
      .collect();
    if (payouts.some((r) => r.state !== 'cancelled')) {
      return;
    }
    // Re-prefill from current data — the withdrawn claim's amount is the
    // presumed-wrong figure (a wrong-amount dispute may be exactly why it
    // was cancelled); the honest default is openRoundForTick's estimate.
    const contributions = await ctx.db
      .query('paymentRecords')
      .withIndex('by_round_and_kind', (q) =>
        q.eq('roundId', roundId).eq('kind', 'contribution')
      )
      .collect();
    const obligatedPayerIds = new Set(
      contributions
        .filter((r) => r.state !== 'cancelled')
        .map((r) => r.payerMembershipId)
    );
    await ctx.db.insert('paymentRecords', {
      groupId: record.groupId,
      roundId,
      kind: 'payout',
      state: 'pending',
      amount: payoutPrefillAmount(
        obligatedPayerIds.size,
        round.expectedAmountPerMember
      ),
      payerMembershipId: record.payerMembershipId,
      payeeMembershipId: record.payeeMembershipId,
      proofType: 'none',
    });
    return;
  }

  const expected = await expectedObligationAmount(ctx, record);
  if (expected === null) {
    return;
  }
  const siblings = await obligationSiblings(ctx, record);
  const billed = siblings
    .filter((r) => r.state !== 'cancelled')
    .reduce((sum, r) => sum + r.amount, 0);
  const shortfall = expected - billed;
  if (shortfall <= 0) {
    return;
  }

  let isArrears = record.isArrears === true;
  if (record.kind === 'contribution' && record.roundId !== undefined) {
    const round = await ctx.db.get(record.roundId);
    if (
      round &&
      (round.status === 'closed' ||
        round.status === 'payout' ||
        round.status === 'completed')
    ) {
      isArrears = true;
    }
  }

  await ctx.db.insert('paymentRecords', {
    groupId: record.groupId,
    roundId: record.roundId,
    kind: record.kind,
    state: 'pending',
    amount: shortfall,
    payerMembershipId: record.payerMembershipId,
    payeeMembershipId: record.payeeMembershipId,
    ...(isArrears && { isArrears: true }),
    proofType: 'none',
    fineId: record.fineId,
    assistanceLevyId: record.assistanceLevyId,
  });
}

/**
 * Effects shared by every path into `confirmed` (counterparty, on-behalf,
 * auto-confirm, dispute resolution): payout confirmation advances the round
 * (02 §b `payout → completed`), and fines flip to `paid` ONLY here, in the
 * same transaction (I-8).
 */
async function afterConfirmed(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<void> {
  if (record.kind === 'payout' && record.roundId !== undefined) {
    await settleRoundAfterPayoutConfirmed(ctx, record.roundId);
  }
  if (record.kind === 'contribution') {
    // A record in flight at close finalizing after close updates the
    // provisionally-frozen obligation status (02 §b closing rule 1).
    await refreezeObligationStatus(ctx, record);
  }
  if (record.kind === 'fine' && record.fineId !== undefined) {
    const fineId = record.fineId;
    const fine = await ctx.db.get(fineId);
    if (fine && fine.status === 'owed') {
      const settlements = await ctx.db
        .query('paymentRecords')
        .withIndex('by_fine', (q) => q.eq('fineId', fineId))
        .collect();
      const confirmedSum = settlements
        .filter((r) => r.state === 'confirmed')
        .reduce((sum, r) => sum + r.amount, 0);
      if (confirmedSum >= fine.amount) {
        await ctx.db.patch(fine._id, {
          status: 'paid',
          resolvedAt: Date.now(),
        });
      }
    }
  }
}

// ============================================================================
// Cron-applied transitions — exported for convex/crons.ts (02 §c rows 5 & 7).
// Both validate through the machine and NEVER throw on a stale record, so a
// single bad row cannot abort a whole tick.
// ============================================================================

/** Row 5 — `T_AUTO_CONFIRM` elapsed on a payee-side claim, payer silent. */
export async function applyAutoConfirm(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<boolean> {
  const result = validateTransition(toSnapshot(record), 'confirmed', {
    type: 'system',
  });
  if (result.ok === false) {
    return false;
  }
  await ctx.db.patch(record._id, {
    state: 'confirmed',
    confirmedAt: Date.now(),
  });
  // Row 5 notification copy: « confirmé automatiquement » — feed entry marked "auto".
  await logActivityEvent(ctx, {
    groupId: record.groupId,
    kind: 'payment_auto_confirmed',
    entityTable: 'paymentRecords',
    entityId: record._id,
    fromState: 'claimed',
    toState: 'confirmed',
  });
  await afterConfirmed(ctx, record);
  return true;
}

/** Row 7 — anchored `T_AUTO_DISPUTE` elapsed on a payer-side claim, payee silent. */
export async function applyAutoDispute(
  ctx: MutationCtx,
  record: Doc<'paymentRecords'>
): Promise<boolean> {
  const result = validateTransition(toSnapshot(record), 'disputed', {
    type: 'system',
  });
  if (result.ok === false) {
    return false;
  }
  // I-6: at most one open dispute per record.
  const disputes = await ctx.db
    .query('disputes')
    .withIndex('by_payment_record', (q) => q.eq('paymentRecordId', record._id))
    .collect();
  if (disputes.some((d) => d.status === 'open')) {
    return false;
  }
  await ctx.db.insert('disputes', {
    paymentRecordId: record._id,
    groupId: record.groupId,
    autoOpened: true,
    status: 'open',
  });
  await ctx.db.patch(record._id, { state: 'disputed', disputedAt: Date.now() });
  // Row 7: PRIVATE escalation only — push to payer, payee, president,
  // treasurer with neutral copy « Paiement non confirmé après {n} jours —
  // à vérifier ». NO group-feed broadcast: the feed renderer must exclude
  // this kind (« litige » framing is reserved for human contests, row 6);
  // the row exists because 02's transitions-log mandate is absolute.
  await logActivityEvent(ctx, {
    groupId: record.groupId,
    kind: 'payment_auto_disputed',
    entityTable: 'paymentRecords',
    entityId: record._id,
    fromState: 'claimed',
    toState: 'disputed',
  });
  // A post-close auto-dispute marks the provisionally-frozen status
  // 'disputed' (02 §b closing rule 1 — scored at resolution).
  await refreezeObligationStatus(ctx, record);
  return true;
}

// ============================================================================
// Mutations — every transition goes through validateTransition
// (convex/lib/paymentStateMachine.ts); rules are never re-implemented here.
// ============================================================================

/**
 * Claim (02 §c rows 2–3): payer-side « j'ai envoyé », or payee-side receipt
 * (Meeting Mode tick / beneficiary « j'ai reçu ») — the side is derived
 * from WHO is calling, never from an argument. Self-records (payer = payee)
 * transition `pending → confirmed` in this single mutation, feed-labeled
 * « auto — même personne », no timers (02 §c DECISION).
 *
 * Idempotency (I-11): the client-generated key no-ops on collision. A
 * partial top-up is a NEW claim on the shortfall record with its own key
 * (05 Week 2 DECISION); a claim below the outstanding obligation
 * immediately re-creates a `pending` record for the shortfall (02 §e7).
 */
export const claim = mutation({
  args: {
    paymentRecordId: v.id('paymentRecords'),
    idempotencyKey: v.string(), // client-generated UUID — REQUIRED (I-11)
    amount: v.optional(v.number()), // defaults to the prefilled amount; editable (02 §e7)
    method: paymentMethodValidator,
    momoTxnId: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id('_storage')),
    note: v.optional(v.string()),
  },
  returns: recordStateResultValidator,
  handler: async (ctx, args) => {
    const idempotencyKey = args.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      throw new Error('Payment record not found');
    }
    const { actor, membership } = await requireActiveActor(ctx, record.groupId);
    await requireWritableGroup(ctx, record.groupId);

    // Offline replay (I-11): the SAME logical tap retried — key and record
    // must match. A key colliding with a different record is a client bug
    // and must surface, never be answered with that record's state.
    const replay = await ctx.db
      .query('paymentRecords')
      .withIndex('by_idempotency_key', (q) =>
        q.eq('idempotencyKey', idempotencyKey)
      )
      .first();
    if (replay) {
      if (replay._id !== record._id) {
        throw new Error('Idempotency key already used for a different record');
      }
      return { paymentRecordId: replay._id, state: replay.state };
    }

    // Re-tap without the original key: no-op only for the recorded
    // claimant's own claim. A counterparty's conflicting concurrent claim
    // (Meeting Mode collision) must surface so their attestation is not
    // silently swallowed.
    if (record.state === 'claimed' || record.state === 'confirmed') {
      if (record.recordedByMembershipId === membership._id) {
        return { paymentRecordId: record._id, state: record.state };
      }
      throw new Error(
        `Record already ${record.state} by the other side — confirm or dispute it instead`
      );
    }

    const amount = args.amount ?? record.amount;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Amount must be a positive whole number of XAF');
    }

    // I-10 proof coherence: cash claims carry no artifact; MoMo txn ID is
    // the nudged proof, screenshot accepted but never trusted.
    if (
      args.method === 'cash' &&
      (args.momoTxnId !== undefined || args.screenshotStorageId !== undefined)
    ) {
      throw new Error(
        'Cash claims carry no proof artifact — confirmation is the proof'
      );
    }
    const proofType =
      args.momoTxnId !== undefined
        ? ('momo_txn_id' as const)
        : args.screenshotStorageId !== undefined
          ? ('screenshot' as const)
          : ('none' as const);

    const now = Date.now();
    const note = args.note?.trim() || undefined;
    const self = isSelfRecord(toSnapshot(record));

    const result = validateTransition(
      toSnapshot(record),
      self ? 'confirmed' : 'claimed',
      actor
    );
    if (result.ok === false) {
      throw new Error(result.reason);
    }

    await ctx.db.patch(record._id, {
      state: self ? 'confirmed' : 'claimed',
      ...(result.setsClaimedBySide !== undefined && {
        claimedBySide: result.setsClaimedBySide,
      }),
      amount,
      method: args.method,
      proofType,
      ...(args.momoTxnId !== undefined && { momoTxnId: args.momoTxnId }),
      ...(args.screenshotStorageId !== undefined && {
        screenshotStorageId: args.screenshotStorageId,
      }),
      ...(note !== undefined && { note }),
      recordedByMembershipId: membership._id,
      idempotencyKey,
      claimedAt: now, // timeliness is measured here (02 §b closing rule 1)
      ...(self && { confirmedAt: now }),
    });

    if (self) {
      // Self-record DECISION: « auto — même personne », skipsTimers — no
      // reminders, no auto-confirm/auto-dispute ever start.
      await logActivityEvent(ctx, {
        groupId: record.groupId,
        kind: 'payment_self_confirmed',
        entityTable: 'paymentRecords',
        entityId: record._id,
        fromState: 'pending',
        toState: 'confirmed',
        actorMembershipId: membership._id,
        note: 'auto — même personne',
      });
    } else if (result.edge === 'claim_payer') {
      // Row 2: push to payee "{payer} déclare avoir payé {amount} —
      // confirmez"; feed entry « déclaré ». Timers (reminders + anchored
      // auto-dispute) are evaluated by the cron from claimedAt.
      await logActivityEvent(ctx, {
        groupId: record.groupId,
        kind: 'payment_claimed_by_payer',
        entityTable: 'paymentRecords',
        entityId: record._id,
        fromState: 'pending',
        toState: 'claimed',
        actorMembershipId: membership._id,
      });
      await notifyMemberships(ctx, [record.payeeMembershipId], {
        titleFr: 'Paiement déclaré',
        titleEn: 'Payment declared',
        bodyFr: `${membership.displayName} déclare avoir payé ${formatXAF(amount)} — confirmez la réception`,
        bodyEn: `${membership.displayName} declares they paid ${formatXAF(amount)} — confirm receipt`,
        url: `/payments/${record._id}`,
      });
    } else {
      // Row 3: push to payer "…a enregistré {amount} reçu de vous —
      // confirmez ou signalez". Starts the T_AUTO_CONFIRM objection window.
      await logActivityEvent(ctx, {
        groupId: record.groupId,
        kind: 'payment_claimed_by_payee',
        entityTable: 'paymentRecords',
        entityId: record._id,
        fromState: 'pending',
        toState: 'claimed',
        actorMembershipId: membership._id,
      });
      await notifyMemberships(ctx, [record.payerMembershipId], {
        titleFr: 'Paiement enregistré',
        titleEn: 'Payment recorded',
        bodyFr: `${membership.displayName} a enregistré ${formatXAF(amount)} reçu de vous — confirmez ou signalez`,
        bodyEn: `${membership.displayName} recorded ${formatXAF(amount)} received from you — confirm or flag it`,
        url: `/payments/${record._id}`,
      });
    }

    // Shortfall split at claim time, not at close (02 §e7 DECISION) — a
    // member who sends 5 000 of 10 000 on day 2 can log the rest this week.
    const claimedRecord = await ctx.db.get(record._id);
    if (claimedRecord && claimedRecord.kind !== 'payout') {
      await ensureObligationRemainder(ctx, claimedRecord);
    }

    return {
      paymentRecordId: record._id,
      state: self ? ('confirmed' as const) : ('claimed' as const),
    };
  },
});

/**
 * Confirm (02 §c row 4): the side that did NOT claim acknowledges — truth =
 * payee confirmation, and for payee-side claims the payer's « C'est exact »
 * is the state-changing tap. The president may confirm on behalf of a
 * counterparty who is hasAccount:false / exited / deceased (mandatory note,
 * feed-labeled « attesté ») — never the record's other party. Idempotent
 * no-op when already confirmed.
 */
export const confirm = mutation({
  args: {
    paymentRecordId: v.id('paymentRecords'),
    note: v.optional(v.string()),
    channel: v.optional(confirmationChannelValidator), // default 'app'; 'meeting' from Meeting Mode
  },
  returns: recordStateResultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      throw new Error('Payment record not found');
    }
    const { actor, membership } = await requireActiveActor(ctx, record.groupId);
    await requireWritableGroup(ctx, record.groupId);

    if (record.state === 'confirmed') {
      return { paymentRecordId: record._id, state: 'confirmed' as const }; // idempotent re-tap
    }
    if (record.state === 'disputed') {
      throw new Error('Disputed records are resolved via resolveDispute');
    }
    if (record.state === 'pending') {
      // Self-records reach confirmed exclusively through claim(), which sets
      // amount/method/claimedAt in the same mutation — confirming a pending
      // record here would freeze the obligation as unpaid while the pot
      // counts the money.
      throw new Error(
        'Nothing to confirm — the record has not been claimed yet'
      );
    }

    const { membership: counterparty, context } = await counterpartyOf(
      ctx,
      record
    );
    const result = validateTransition(
      toSnapshot(record),
      'confirmed',
      actor,
      context
    );
    if (result.ok === false) {
      throw new Error(result.reason);
    }

    const note = args.note?.trim() || undefined;
    if (result.requiresNote && note === undefined) {
      throw new Error(
        'A note is mandatory when confirming on someone’s behalf'
      );
    }

    const counterpartySide = counterpartySideOf(
      record.claimedBySide as 'payer' | 'payee'
    );
    await ctx.db.insert('confirmations', {
      paymentRecordId: record._id,
      groupId: record.groupId,
      membershipId: membership._id,
      ...(result.edge === 'confirm_on_behalf' &&
        counterparty && { onBehalfOfMembershipId: counterparty._id }),
      side: counterpartySide,
      channel: args.channel ?? 'app',
      ...(note !== undefined && { note }),
    });
    await ctx.db.patch(record._id, {
      state: 'confirmed',
      confirmedAt: Date.now(),
    });

    if (result.edge === 'confirm_on_behalf') {
      // Row 4 copy: feed-labeled « attesté par le président pour {name} ».
      await logActivityEvent(ctx, {
        groupId: record.groupId,
        kind: 'payment_confirmed_on_behalf',
        entityTable: 'paymentRecords',
        entityId: record._id,
        fromState: 'claimed',
        toState: 'confirmed',
        actorMembershipId: membership._id,
        note: counterparty
          ? `attesté pour ${counterparty.displayName} — ${note}`
          : note,
      });
    } else {
      // Row 4 copy: push to both "Confirmé ✓ {amount}".
      await logActivityEvent(ctx, {
        groupId: record.groupId,
        kind: 'payment_confirmed',
        entityTable: 'paymentRecords',
        entityId: record._id,
        fromState: 'claimed',
        toState: 'confirmed',
        actorMembershipId: membership._id,
      });
    }
    const claimantMembershipId =
      record.claimedBySide === 'payer'
        ? record.payerMembershipId
        : record.payeeMembershipId;
    await notifyMemberships(ctx, [claimantMembershipId], {
      titleFr: 'Confirmé ✓',
      titleEn: 'Confirmed ✓',
      bodyFr: `${membership.displayName} a confirmé ${formatXAF(record.amount)}`,
      bodyEn: `${membership.displayName} confirmed ${formatXAF(record.amount)}`,
      url: `/payments/${record._id}`,
    });

    await afterConfirmed(ctx, record);
    return { paymentRecordId: record._id, state: 'confirmed' as const };
  },
});

/**
 * Dispute (02 §c row 6): the counterparty taps « Je n'ai pas reçu » /
 * « Je conteste » with a mandatory reason. The president may object on
 * behalf of an unrepresented counterparty (symmetric on-behalf right).
 * Human contests keep the « litige » framing and ARE feed-visible (unlike
 * row 7 auto-disputes). Idempotent no-op when already disputed.
 */
export const dispute = mutation({
  args: {
    paymentRecordId: v.id('paymentRecords'),
    reason: disputeReasonValidator,
    note: v.optional(v.string()),
  },
  returns: recordStateResultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      throw new Error('Payment record not found');
    }
    const { actor, membership } = await requireActiveActor(ctx, record.groupId);
    await requireWritableGroup(ctx, record.groupId);

    if (record.state === 'disputed') {
      return { paymentRecordId: record._id, state: 'disputed' as const }; // idempotent re-tap
    }

    const { context } = await counterpartyOf(ctx, record);
    const result = validateTransition(
      toSnapshot(record),
      'disputed',
      actor,
      context
    );
    if (result.ok === false) {
      throw new Error(result.reason);
    }

    // I-6: at most one open dispute per record.
    const disputes = await ctx.db
      .query('disputes')
      .withIndex('by_payment_record', (q) =>
        q.eq('paymentRecordId', record._id)
      )
      .collect();
    if (disputes.some((d) => d.status === 'open')) {
      throw new Error('This record already has an open dispute');
    }

    const note = args.note?.trim() || undefined;
    await ctx.db.insert('disputes', {
      paymentRecordId: record._id,
      groupId: record.groupId,
      openedByMembershipId: membership._id,
      autoOpened: false,
      reason: args.reason,
      ...(note !== undefined && { reasonNote: note }),
      status: 'open',
    });
    await ctx.db.patch(record._id, {
      state: 'disputed',
      disputedAt: Date.now(),
    });

    // Row 6 copy: push to payer, payee, president, treasurer "Litige ouvert
    // sur {amount} — round {n}". Feed entry (human contests keep « litige »).
    await logActivityEvent(ctx, {
      groupId: record.groupId,
      kind: 'payment_disputed',
      entityTable: 'paymentRecords',
      entityId: record._id,
      fromState: 'claimed',
      toState: 'disputed',
      actorMembershipId: membership._id,
      note,
    });
    {
      const officers = await ctx.db
        .query('memberships')
        .withIndex('by_group', (q) => q.eq('groupId', record.groupId))
        .collect();
      const recipientIds = new Set<Id<'memberships'>>([
        record.payerMembershipId,
        record.payeeMembershipId,
        ...officers
          .filter(
            (m) =>
              m.status === 'active' &&
              (m.role === 'president' || m.role === 'treasurer')
          )
          .map((m) => m._id),
      ]);
      recipientIds.delete(membership._id); // not the person who just tapped
      await notifyMemberships(ctx, [...recipientIds], {
        titleFr: 'Litige ouvert',
        titleEn: 'Dispute opened',
        bodyFr: `Litige ouvert sur ${formatXAF(record.amount)} par ${membership.displayName}`,
        bodyEn: `Dispute opened on ${formatXAF(record.amount)} by ${membership.displayName}`,
        url: `/payments/${record._id}`,
      });
    }

    // A post-close dispute marks the provisionally-frozen status 'disputed'
    // (02 §b closing rule 1 — scored at resolution).
    await refreezeObligationStatus(ctx, record);

    return { paymentRecordId: record._id, state: 'disputed' as const };
  },
});

/**
 * Withdraw (02 §c rows 8 & 10): the claimant cancels their own claim
 * (« Je me suis trompé » from `claimed`; « Je retire ma déclaration » from
 * `disputed` — payer only, per the machine). A fresh `pending` record is
 * re-created when the obligation is still unmet, so it is never silently
 * lost. President dispute-overrides go through resolveDispute, never here.
 */
export const cancel = mutation({
  args: {
    paymentRecordId: v.id('paymentRecords'),
    note: v.optional(v.string()),
  },
  returns: recordStateResultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      throw new Error('Payment record not found');
    }
    const { actor, membership } = await requireActiveActor(ctx, record.groupId);
    await requireWritableGroup(ctx, record.groupId);

    if (record.state === 'cancelled') {
      return { paymentRecordId: record._id, state: 'cancelled' as const }; // idempotent re-tap
    }
    if (record.state !== 'claimed' && record.state !== 'disputed') {
      // Row 13 pending bulk-cancels belong to the skip/exit/terminate flows,
      // not to this claimant-facing mutation.
      throw new Error('Only claimed or disputed records can be withdrawn');
    }

    const result = validateTransition(toSnapshot(record), 'cancelled', actor);
    if (result.ok === false) {
      throw new Error(result.reason);
    }
    if (result.edge === 'override_cancel') {
      throw new Error('President dispute overrides go through resolveDispute');
    }

    const note = args.note?.trim() || undefined;
    const now = Date.now();

    if (record.state === 'disputed') {
      // Row 10: withdrawing from a dispute resolves it against the claim.
      const disputes = await ctx.db
        .query('disputes')
        .withIndex('by_payment_record', (q) =>
          q.eq('paymentRecordId', record._id)
        )
        .collect();
      const open = disputes.find((d) => d.status === 'open');
      if (open) {
        await ctx.db.patch(open._id, {
          status: 'resolved_cancelled',
          resolvedByMembershipId: membership._id,
          ...(note !== undefined && { resolutionNote: note }),
          resolvedAt: now,
        });
      }
    }

    await ctx.db.patch(record._id, { state: 'cancelled', cancelledAt: now });

    await logActivityEvent(ctx, {
      groupId: record.groupId,
      // Row 8 copy: push to counterparty + feed. Row 10 copy: "Litige
      // résolu — déclaration retirée" to all parties + president.
      kind:
        result.edge === 'withdraw_from_dispute'
          ? 'dispute_resolved_cancelled'
          : 'payment_claim_withdrawn',
      entityTable: 'paymentRecords',
      entityId: record._id,
      fromState: record.state,
      toState: 'cancelled',
      actorMembershipId: membership._id,
      note,
    });

    if (result.recreatePendingIfObligationUnmet) {
      const cancelled = await ctx.db.get(record._id);
      if (cancelled) {
        await ensureObligationRemainder(ctx, cancelled);
      }
    }
    // A post-close withdrawal downgrades the provisionally-frozen status
    // (after the remainder re-creation so the arrears pending is counted).
    await refreezeObligationStatus(ctx, record);

    return { paymentRecordId: record._id, state: 'cancelled' as const };
  },
});

/**
 * Dispute resolution (02 §c rows 9–11, §d): payee late-confirm
 * (« finalement reçu »), payer withdrawal, or president override —
 * mandatory ≥ 10-char note + immutable presidentOverrides row. Disputes
 * never auto-resolve; only humans close them. The paymentRecord and the
 * dispute row move in the SAME mutation, so they can never disagree.
 */
export const resolveDispute = mutation({
  args: {
    paymentRecordId: v.id('paymentRecords'),
    outcome: overrideOutcomeValidator, // 'confirmed' | 'cancelled'
    note: v.optional(v.string()),
  },
  returns: recordStateResultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      throw new Error('Payment record not found');
    }
    const { actor, membership } = await requireActiveActor(ctx, record.groupId);
    await requireWritableGroup(ctx, record.groupId);

    if (record.state === args.outcome) {
      return { paymentRecordId: record._id, state: record.state }; // idempotent re-tap
    }
    if (record.state !== 'disputed') {
      throw new Error('Only disputed records can be resolved');
    }

    const result = validateTransition(toSnapshot(record), args.outcome, actor);
    if (result.ok === false) {
      throw new Error(result.reason);
    }

    const note = args.note?.trim() || undefined;
    const isOverride =
      result.edge === 'override_confirm' || result.edge === 'override_cancel';
    if (isOverride) {
      if (note === undefined || note.length < MIN_OVERRIDE_NOTE_LENGTH) {
        throw new Error(
          `A note of at least ${MIN_OVERRIDE_NOTE_LENGTH} characters is mandatory for a president override`
        );
      }
      // The override is itself a ledger artifact — immutable, exported,
      // never editable (02 §d).
      await ctx.db.insert('presidentOverrides', {
        paymentRecordId: record._id,
        groupId: record.groupId,
        outcome: args.outcome,
        note,
        presidentMembershipId: membership._id,
      });
    }

    const now = Date.now();
    const disputes = await ctx.db
      .query('disputes')
      .withIndex('by_payment_record', (q) =>
        q.eq('paymentRecordId', record._id)
      )
      .collect();
    const open = disputes.find((d) => d.status === 'open');
    if (open) {
      await ctx.db.patch(open._id, {
        status:
          args.outcome === 'confirmed'
            ? 'resolved_confirmed'
            : 'resolved_cancelled',
        resolvedByMembershipId: membership._id,
        ...(note !== undefined && { resolutionNote: note }),
        resolvedAt: now,
      });
    }

    if (args.outcome === 'confirmed') {
      if (result.edge === 'late_confirm') {
        // Row 9: a real counterparty acknowledgment — append the confirmation
        // event on the side that did NOT claim (payee for payer-side claims,
        // payer for payee-side / Meeting Mode claims).
        await ctx.db.insert('confirmations', {
          paymentRecordId: record._id,
          groupId: record.groupId,
          membershipId: membership._id,
          side: counterpartySideOf(record.claimedBySide as 'payer' | 'payee'),
          channel: 'app',
          ...(note !== undefined && { note }),
        });
      }
      await ctx.db.patch(record._id, { state: 'confirmed', confirmedAt: now });
    } else {
      await ctx.db.patch(record._id, { state: 'cancelled', cancelledAt: now });
    }

    await logActivityEvent(ctx, {
      groupId: record.groupId,
      // Row 9 copy: "Litige résolu — confirmé". Row 10 copy: "Litige résolu
      // — déclaration retirée". Row 11 copy: outcome + note excerpt to the
      // group feed (UI badges « résolu par le président (partie au litige) »
      // when the president is a party).
      kind: isOverride
        ? 'president_override'
        : args.outcome === 'confirmed'
          ? 'dispute_resolved_confirmed'
          : 'dispute_resolved_cancelled',
      entityTable: 'paymentRecords',
      entityId: record._id,
      fromState: 'disputed',
      toState: args.outcome,
      actorMembershipId: membership._id,
      note,
    });

    if (args.outcome === 'confirmed') {
      await afterConfirmed(ctx, record);
    } else {
      if (result.recreatePendingIfObligationUnmet) {
        const cancelled = await ctx.db.get(record._id);
        if (cancelled) {
          await ensureObligationRemainder(ctx, cancelled);
        }
      }
      // Resolving a disputed-frozen status to cancelled finalizes/downgrades
      // the frozen entry (02 §b closing rule 1).
      await refreezeObligationStatus(ctx, record);
    }

    return { paymentRecordId: record._id, state: args.outcome };
  },
});

// ============================================================================
// Queries — inbox + per-record detail (payment-features-plan Slice 3)
// ============================================================================

const inboxItemValidator = v.object({
  paymentRecordId: v.id('paymentRecords'),
  groupId: v.id('groups'),
  groupName: v.string(),
  roundId: v.union(v.id('rounds'), v.null()),
  roundIndex: v.union(v.number(), v.null()),
  kind: paymentKindValidator,
  amount: v.number(),
  method: v.optional(paymentMethodValidator),
  momoTxnId: v.optional(v.string()),
  claimedAt: v.optional(v.number()),
  claimedBySide: v.optional(paymentSideValidator),
  counterpartyName: v.string(), // who claimed — the person awaiting MY answer
  reference: v.string(), // NJG-T<round> — matches the carrier SMS reason field
});

/**
 * Claims awaiting the CALLER's confirmation, across all their groups
 * (docs/03 B5 « À confirmer »): payer-side claims where I am the payee
 * (treasurer inbox), payee-side claims where I am the payer (objection
 * window — Meeting Mode ticks / beneficiary receipts). Newest first.
 */
export const myInbox = query({
  args: {},
  returns: v.array(inboxItemValidator),
  handler: async (ctx) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return [];
    }
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', auth.user._id))
      .collect();

    const items = [];
    for (const membership of memberships.filter((m) => m.status === 'active')) {
      const awaitingAsPayee = await ctx.db
        .query('paymentRecords')
        .withIndex('by_payee_and_state', (q) =>
          q.eq('payeeMembershipId', membership._id).eq('state', 'claimed')
        )
        .take(100);
      const awaitingAsPayer = await ctx.db
        .query('paymentRecords')
        .withIndex('by_payer_and_state', (q) =>
          q.eq('payerMembershipId', membership._id).eq('state', 'claimed')
        )
        .take(100);
      const awaiting = [
        ...awaitingAsPayee.filter((r) => r.claimedBySide === 'payer'),
        ...awaitingAsPayer.filter((r) => r.claimedBySide === 'payee'),
      ];

      for (const record of awaiting) {
        const group = await ctx.db.get(record.groupId);
        const claimantId =
          record.claimedBySide === 'payer'
            ? record.payerMembershipId
            : record.payeeMembershipId;
        const claimant = await ctx.db.get(claimantId);
        const round =
          record.roundId !== undefined
            ? await ctx.db.get(record.roundId)
            : null;
        items.push({
          paymentRecordId: record._id,
          groupId: record.groupId,
          groupName: group?.name ?? '—',
          roundId: record.roundId ?? null,
          roundIndex: round ? round.index : null,
          kind: record.kind,
          amount: record.amount,
          method: record.method,
          momoTxnId: record.momoTxnId,
          claimedAt: record.claimedAt,
          claimedBySide: record.claimedBySide,
          counterpartyName: claimant?.displayName ?? '—',
          reference: round ? `NJG-T${round.index}` : '',
        });
      }
    }

    return items.sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));
  },
});

const paymentRecordDetailValidator = v.object({
  paymentRecordId: v.id('paymentRecords'),
  groupId: v.id('groups'),
  groupName: v.string(),
  roundId: v.union(v.id('rounds'), v.null()),
  roundIndex: v.union(v.number(), v.null()),
  roundDueAt: v.union(v.number(), v.null()),
  kind: paymentKindValidator,
  state: paymentStateValidator,
  amount: v.number(),
  method: v.optional(paymentMethodValidator),
  proofType: proofTypeValidator,
  momoTxnId: v.optional(v.string()),
  isArrears: v.optional(v.boolean()),
  claimedBySide: v.optional(paymentSideValidator),
  claimedAt: v.optional(v.number()),
  confirmedAt: v.optional(v.number()),
  disputedAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),
  payerName: v.string(),
  payeeName: v.string(),
  reference: v.string(),
  dispute: v.union(
    v.null(),
    v.object({
      status: disputeStatusValidator,
      reason: v.optional(disputeReasonValidator),
      reasonNote: v.optional(v.string()),
      resolutionNote: v.optional(v.string()),
      autoOpened: v.boolean(),
      openedByName: v.union(v.string(), v.null()),
    })
  ),
  // Viewer-relative flags — the SCREEN chooses affordances from these; the
  // mutations re-validate through the state machine regardless.
  viewerIsClaimant: v.boolean(),
  viewerIsCounterparty: v.boolean(),
  viewerCanConfirm: v.boolean(),
  viewerCanDispute: v.boolean(),
  viewerCanCancel: v.boolean(),
  viewerCanResolveDispute: v.boolean(),
});

/**
 * Single-record read backing the inbox row detail and the
 * `payments/[paymentId]` deep-link target (a push can land on a record no
 * longer in any inbox — the screen must still render `confirmed`/`disputed`
 * records plus the dispute thread).
 */
export const getPaymentRecord = query({
  args: {
    paymentRecordId: v.id('paymentRecords'),
  },
  returns: v.union(v.null(), paymentRecordDetailValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return null;
    }
    const record = await ctx.db.get(args.paymentRecordId);
    if (!record) {
      return null;
    }
    const { membership: viewer } = await requireMembership(ctx, record.groupId);

    const [group, payer, payee, round] = await Promise.all([
      ctx.db.get(record.groupId),
      ctx.db.get(record.payerMembershipId),
      ctx.db.get(record.payeeMembershipId),
      record.roundId !== undefined
        ? ctx.db.get(record.roundId)
        : Promise.resolve(null),
    ]);

    const disputes = await ctx.db
      .query('disputes')
      .withIndex('by_payment_record', (q) =>
        q.eq('paymentRecordId', record._id)
      )
      .collect();
    const disputeRow =
      disputes.find((d) => d.status === 'open') ??
      disputes.sort((a, b) => b._creationTime - a._creationTime)[0] ??
      null;
    const openedBy = disputeRow?.openedByMembershipId
      ? await ctx.db.get(disputeRow.openedByMembershipId)
      : null;

    const claimantId =
      record.claimedBySide === 'payer'
        ? record.payerMembershipId
        : record.claimedBySide === 'payee'
          ? record.payeeMembershipId
          : null;
    const counterpartyId =
      record.claimedBySide === 'payer'
        ? record.payeeMembershipId
        : record.claimedBySide === 'payee'
          ? record.payerMembershipId
          : null;
    const counterparty = counterpartyId
      ? ((await ctx.db.get(counterpartyId)) ?? null)
      : null;
    const counterpartyNeedsRepresentation =
      counterparty !== null &&
      (counterparty.userId === undefined ||
        counterparty.status === 'exited' ||
        counterparty.status === 'deceased');

    const viewerIsClaimant = claimantId === viewer._id;
    const viewerIsCounterparty = counterpartyId === viewer._id;
    const viewerActive = viewer.status === 'active';
    const presidentOnBehalf =
      viewerActive &&
      viewer.role === 'president' &&
      counterpartyNeedsRepresentation &&
      !viewerIsClaimant;

    return {
      paymentRecordId: record._id,
      groupId: record.groupId,
      groupName: group?.name ?? '—',
      roundId: record.roundId ?? null,
      roundIndex: round ? round.index : null,
      roundDueAt: round ? round.dueAt : null,
      kind: record.kind,
      state: record.state,
      amount: record.amount,
      method: record.method,
      proofType: record.proofType,
      momoTxnId: record.momoTxnId,
      isArrears: record.isArrears,
      claimedBySide: record.claimedBySide,
      claimedAt: record.claimedAt,
      confirmedAt: record.confirmedAt,
      disputedAt: record.disputedAt,
      cancelledAt: record.cancelledAt,
      payerName: payer?.displayName ?? '—',
      payeeName: payee?.displayName ?? '—',
      reference: round ? `NJG-T${round.index}` : '',
      dispute: disputeRow
        ? {
            status: disputeRow.status,
            reason: disputeRow.reason,
            reasonNote: disputeRow.reasonNote,
            resolutionNote: disputeRow.resolutionNote,
            autoOpened: disputeRow.autoOpened,
            openedByName: openedBy?.displayName ?? null,
          }
        : null,
      viewerIsClaimant,
      viewerIsCounterparty,
      viewerCanConfirm:
        record.state === 'claimed' &&
        viewerActive &&
        (viewerIsCounterparty || presidentOnBehalf),
      viewerCanDispute:
        record.state === 'claimed' &&
        viewerActive &&
        (viewerIsCounterparty || presidentOnBehalf),
      viewerCanCancel:
        (record.state === 'claimed' || record.state === 'disputed') &&
        viewerActive &&
        viewerIsClaimant,
      viewerCanResolveDispute:
        record.state === 'disputed' &&
        viewerActive &&
        (viewerIsCounterparty ||
          viewerIsClaimant ||
          viewer.role === 'president'),
    };
  },
});
