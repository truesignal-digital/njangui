// ─────────────────────────────────────────────────────────────
// PaymentRecord state machine — pure transition logic.
//
// Source of truth: docs/02-lifecycle-state-machines.md §c (full
// transition table, rows 1–15). 02 is NORMATIVE for transitions;
// docs/01-domain-model.md §3.2 is the schema-level projection.
//
// NO Convex imports here — plain TypeScript types + functions so
// the machine is unit-testable (colocated paymentStateMachine.test.ts)
// and every mutation calls the same single source of truth
// (01 §3.2: "one source of truth, no scattered `if`s").
//
// CUSTODY-FREE RED LINE: this machine changes LEDGER STATE only.
// The app never moves member money; truth = payee confirmation.
// ─────────────────────────────────────────────────────────────

// Literal types mirror the exported validators in convex/schema.ts
// (paymentStateValidator, paymentSideValidator, paymentKindValidator).
export type PaymentState =
  | 'pending'
  | 'claimed'
  | 'confirmed'
  | 'disputed'
  | 'cancelled';

export type PaymentSide = 'payer' | 'payee';

export type PaymentKind = 'contribution' | 'payout' | 'fine' | 'assistance';

// ─────────────────────────────────────────────────────────────
// Timer constants — 02 "Global timer constants" table.
// DECISION (02): fixed app-wide, NOT group-configurable. The only
// per-group timer is GRACE_DAYS (groups.graceDays, default 2, 0–7).
// All values in milliseconds except the GRACE_DAYS_* day counts.
// ─────────────────────────────────────────────────────────────

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** First reminder to the confirming party after a claim (row 14). Never for self-records. */
export const T_CONFIRM_REMIND_1 = 24 * HOUR_MS;
/** Second reminder to the confirming party (row 14). */
export const T_CONFIRM_REMIND_2 = 48 * HOUR_MS;
/**
 * Payer-logged claim unconfirmed by payee → auto-disputed (row 7).
 * ANCHORED to the réunion: fires at max(claimedAt + T_AUTO_DISPUTE, dueAt),
 * never before the due date — see autoDisputeFiresAt().
 */
export const T_AUTO_DISPUTE = 72 * HOUR_MS;
/** Same mechanism for `payout`-kind records — payout reconciliation is slower (05 Week 2 DECISION). */
export const T_AUTO_DISPUTE_PAYOUT = 7 * DAY_MS;
/** Payee-logged claim (Meeting Mode) with silent payer → auto-confirmed (row 5). */
export const T_AUTO_CONFIRM = 48 * HOUR_MS;
/** Open dispute unresolved → escalation reminder to president, repeats weekly. */
export const T_DISPUTE_STALE = 7 * DAY_MS;
/**
 * Payout record still `pending` (never claimed) 7 days after round close
 * (`via_treasurer` groups) → feed alert + push to president + prompt to
 * beneficiary, repeats weekly. The anti-abscond timer (row 15, 04 §C).
 */
export const T_PAYOUT_STALE = 7 * DAY_MS;
/** Round grace period after due date — the ONLY group-configurable timer (days, on groups.graceDays). */
export const GRACE_DAYS_DEFAULT = 2;
export const GRACE_DAYS_MIN = 0;
export const GRACE_DAYS_MAX = 7;

/** Auto-dispute window for a record kind (72h contributions/fines/assistance, 7d payouts). */
export function autoDisputeWindowMs(kind: PaymentKind): number {
  return kind === 'payout' ? T_AUTO_DISPUTE_PAYOUT : T_AUTO_DISPUTE;
}

/**
 * Anchored auto-dispute (02 §c DECISION): fires at
 * max(claimedAt + window, dueAt) — never before the réunion, so early MoMo
 * self-logs never raise false alarms against a treasurer who culturally
 * reconciles at the meeting. `dueAt` is absent for round-less records
 * (fines / assistance without a round): the window alone applies.
 */
export function autoDisputeFiresAt(input: {
  claimedAt: number;
  kind: PaymentKind;
  dueAt?: number;
}): number {
  const unanchored = input.claimedAt + autoDisputeWindowMs(input.kind);
  return input.dueAt === undefined ? unanchored : Math.max(unanchored, input.dueAt);
}

// ─────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────

/** The slice of a paymentRecords row the machine needs. Ids are plain strings (no Convex types). */
export interface PaymentRecordSnapshot {
  state: PaymentState;
  kind: PaymentKind;
  payerMembershipId: string;
  payeeMembershipId: string;
  /** Which side asserted the claim. Absent until claimed (02's name, stored on the record). */
  claimedBySide?: PaymentSide;
}

/**
 * Who is attempting the transition.
 * - 'system': cron / automatic transitions (auto-confirm, auto-dispute, bulk obligation cancels).
 * - 'member': any human actor, identified by their membership in the record's group.
 *   `isPresident` marks the group's current president (overrides + on-behalf rights).
 */
export type Actor =
  | { type: 'system' }
  | { type: 'member'; membershipId: string; isPresident?: boolean };

export interface TransitionContext {
  /**
   * True when the COUNTERPARTY (the side that did not claim) cannot act for
   * itself: membership has no linked user (feature phone, 02/05's
   * hasAccount:false ≡ userId absent) OR status is 'exited' / 'deceased'.
   * This is the ONLY condition under which the president may confirm or
   * dispute on the counterparty's behalf (02 §c rows 4 & 6). Computed by
   * the calling mutation from the counterparty membership.
   */
  counterpartyNeedsRepresentation?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Transition map (state pairs) — 02 §c diagram. Actor/side guards
// are enforced in validateTransition; this map is shape only.
// ─────────────────────────────────────────────────────────────

export const PAYMENT_STATES: readonly PaymentState[] = [
  'pending',
  'claimed',
  'confirmed',
  'disputed',
  'cancelled',
];

export const LEGAL_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  // pending → confirmed exists ONLY for self-records (payer = payee).
  pending: ['claimed', 'confirmed', 'cancelled'],
  claimed: ['confirmed', 'disputed', 'cancelled'],
  // `confirmed` is ledger-final (02 §c): NO state-mutating exit. Corrections
  // to confirmed records are president-override amendment records (02 row 12)
  // plus an immutable presidentOverrides row — never a transition.
  confirmed: [],
  disputed: ['confirmed', 'cancelled'],
  cancelled: [],
};

/** The treasurer's own contribution every round, the treasurer-as-beneficiary payout, etc. */
export function isSelfRecord(
  record: Pick<PaymentRecordSnapshot, 'payerMembershipId' | 'payeeMembershipId'>
): boolean {
  return record.payerMembershipId === record.payeeMembershipId;
}

export function counterpartySideOf(side: PaymentSide): PaymentSide {
  return side === 'payer' ? 'payee' : 'payer';
}

export function membershipIdForSide(
  record: Pick<PaymentRecordSnapshot, 'payerMembershipId' | 'payeeMembershipId'>,
  side: PaymentSide
): string {
  return side === 'payer' ? record.payerMembershipId : record.payeeMembershipId;
}

// ─────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────

/** Which row of 02 §c's table matched. */
export type TransitionEdge =
  | 'claim_payer' // row 2 — « j'ai envoyé »
  | 'claim_payee' // row 3 — Meeting Mode tick / « j'ai reçu »
  | 'self_record_confirm' // self-record DECISION — pending → confirmed in ONE mutation, « auto — même personne »
  | 'cancel_obligation' // row 13 — obligation void (skip / exit / cancelled round / dissolution / waive)
  | 'confirm_by_counterparty' // row 4
  | 'confirm_on_behalf' // row 4 — president for an unrepresented counterparty, « attesté »
  | 'auto_confirm' // row 5 — T_AUTO_CONFIRM, payee-side claims only
  | 'dispute_by_counterparty' // row 6 — « Je n'ai pas reçu »
  | 'dispute_on_behalf' // row 6 — symmetric on-behalf objection right
  | 'auto_dispute' // row 7 — anchored T_AUTO_DISPUTE, payer-side claims only
  | 'withdraw_claim' // row 8 — claimant only
  | 'late_confirm' // row 9 — payee, « finalement reçu »
  | 'withdraw_from_dispute' // row 10 — payer
  | 'override_confirm' // row 11 — president, mandatory note
  | 'override_cancel'; // row 11 — president, mandatory note

export type TransitionResult =
  | {
      ok: true;
      edge: TransitionEdge;
      /** Set on the record by the claim mutations (rows 2–3). */
      setsClaimedBySide?: PaymentSide;
      /** Mandatory note (president on-behalf, president override, president obligation-cancel). */
      requiresNote: boolean;
      /** Mandatory dispute reason — member/on-behalf-opened disputes only (row 6); auto-disputes carry none. */
      requiresReason: boolean;
      /**
       * Cancelling a claimed/disputed record on an unmet obligation re-creates
       * a fresh `pending` record in the same mutation (02 §c; idempotent —
       * skip if obligation satisfied or membership terminal).
       */
      recreatePendingIfObligationUnmet: boolean;
      /** No confirm-reminder / auto-confirm / auto-dispute timers ever start (self-records). */
      skipsTimers: boolean;
    }
  | { ok: false; reason: string };

function allow(
  edge: TransitionEdge,
  opts: Partial<Omit<Extract<TransitionResult, { ok: true }>, 'ok' | 'edge'>> = {}
): TransitionResult {
  return {
    ok: true,
    edge,
    requiresNote: false,
    requiresReason: false,
    recreatePendingIfObligationUnmet: false,
    skipsTimers: false,
    ...opts,
  };
}

function reject(reason: string): TransitionResult {
  return { ok: false, reason };
}

// ─────────────────────────────────────────────────────────────
// The machine
// ─────────────────────────────────────────────────────────────

/**
 * Validate one attempted transition. Pure — no I/O, no clock.
 *
 * Idempotency note (01 §3.2): a record already in the TARGET state is the
 * mutation layer's no-op re-tap case, checked BEFORE calling the machine;
 * here `from === to` is simply not a transition and is rejected.
 */
export function validateTransition(
  record: PaymentRecordSnapshot,
  to: PaymentState,
  actor: Actor,
  ctx: TransitionContext = {}
): TransitionResult {
  const from = record.state;

  if (from === 'confirmed') {
    return reject(
      'confirmed is ledger-final and never mutated (02 §c) — corrections are president-override amendment records, not transitions'
    );
  }
  if (!LEGAL_TRANSITIONS[from].includes(to) || from === to) {
    return reject(`illegal transition: ${from} → ${to}`);
  }

  const self = isSelfRecord(record);

  // ── pending → claimed (rows 2–3) ─────────────────────────────
  if (from === 'pending' && to === 'claimed') {
    if (self) {
      return reject(
        'self-record (payer = payee): a two-sided handshake is meaningless — claim transitions pending → confirmed in a single mutation'
      );
    }
    if (actor.type !== 'member') {
      return reject('only a party to the record may claim it');
    }
    if (actor.membershipId === record.payerMembershipId) {
      // Starts T_CONFIRM_REMIND_1/2 + anchored auto-dispute (autoDisputeFiresAt).
      return allow('claim_payer', { setsClaimedBySide: 'payer' });
    }
    if (actor.membershipId === record.payeeMembershipId) {
      // Starts T_AUTO_CONFIRM — the payer's objection window.
      return allow('claim_payee', { setsClaimedBySide: 'payee' });
    }
    return reject('only the payer or the payee may claim this record');
  }

  // ── pending → confirmed (self-record DECISION) ───────────────
  if (from === 'pending' && to === 'confirmed') {
    if (!self) {
      return reject(
        'pending → confirmed is reserved for self-records (payer = payee); all other records must be claimed and confirmed by the counterparty'
      );
    }
    if (actor.type !== 'member' || actor.membershipId !== record.payerMembershipId) {
      return reject('only the self-record holder may record their own payment');
    }
    // Feed-labeled « auto — même personne »; excluded from pilot entry-metric denominator.
    return allow('self_record_confirm', { skipsTimers: true });
  }

  // ── pending → cancelled (row 13) ─────────────────────────────
  if (from === 'pending' && to === 'cancelled') {
    if (actor.type === 'system') {
      return allow('cancel_obligation');
    }
    if (actor.isPresident) {
      return allow('cancel_obligation', { requiresNote: true });
    }
    return reject('only the system or the president (mandatory note) may cancel a pending obligation');
  }

  // claimed-state transitions need to know which side asserted the claim.
  const claimedBySide = record.claimedBySide;
  if (from === 'claimed' && claimedBySide === undefined) {
    return reject('claimed record is missing claimedBySide — data integrity error');
  }

  // ── claimed → confirmed (rows 4–5) ───────────────────────────
  if (from === 'claimed' && to === 'confirmed') {
    const side = claimedBySide as PaymentSide;
    const claimantId = membershipIdForSide(record, side);
    const counterpartyId = membershipIdForSide(record, counterpartySideOf(side));
    if (actor.type === 'system') {
      // Row 5: auto-confirm applies EXCLUSIVELY to payee-side claims — a
      // silent feature-phone payer auto-confirms, never auto-disputes.
      if (side !== 'payee') {
        return reject('auto-confirm (T_AUTO_CONFIRM) applies to payee-side claims only');
      }
      return allow('auto_confirm');
    }
    if (actor.membershipId === counterpartyId) {
      return allow('confirm_by_counterparty');
    }
    if (actor.membershipId === claimantId) {
      // Covers the president too: never the record's other party — the
      // paying treasurer can never confirm their own payout claim.
      return reject('no self-confirmation: the claimant cannot confirm their own claim');
    }
    if (actor.isPresident) {
      if (!ctx.counterpartyNeedsRepresentation) {
        return reject(
          'president may confirm on behalf only of a counterparty who is hasAccount:false, exited, or deceased'
        );
      }
      return allow('confirm_on_behalf', { requiresNote: true });
    }
    return reject('only the counterparty (or a qualifying president on-behalf) may confirm');
  }

  // ── claimed → disputed (rows 6–7) ────────────────────────────
  if (from === 'claimed' && to === 'disputed') {
    const side = claimedBySide as PaymentSide;
    const claimantId = membershipIdForSide(record, side);
    const counterpartyId = membershipIdForSide(record, counterpartySideOf(side));
    if (actor.type === 'system') {
      // Row 7: anchored auto-dispute applies EXCLUSIVELY to payer-side claims
      // (payee never acknowledged receiving money). Private escalation only.
      if (side !== 'payer') {
        return reject('auto-dispute (T_AUTO_DISPUTE) applies to payer-side claims only');
      }
      return allow('auto_dispute');
    }
    if (actor.membershipId === counterpartyId) {
      return allow('dispute_by_counterparty', { requiresReason: true });
    }
    if (actor.membershipId === claimantId) {
      return reject('the claimant cannot dispute their own claim — withdraw it instead (claimed → cancelled)');
    }
    if (actor.isPresident) {
      // Row 6: symmetric on-behalf objection right — the objection window
      // must not be fictional for feature-phone payers.
      if (!ctx.counterpartyNeedsRepresentation) {
        return reject(
          'president may dispute on behalf only of a counterparty who is hasAccount:false, exited, or deceased'
        );
      }
      return allow('dispute_on_behalf', { requiresReason: true });
    }
    return reject('only the counterparty (or a qualifying president on-behalf) may open a dispute');
  }

  // ── claimed → cancelled (row 8) ──────────────────────────────
  if (from === 'claimed' && to === 'cancelled') {
    const side = claimedBySide as PaymentSide;
    const claimantId = membershipIdForSide(record, side);
    if (actor.type !== 'member' || actor.membershipId !== claimantId) {
      return reject('only the claimant may withdraw their own claim (« Je me suis trompé »)');
    }
    return allow('withdraw_claim', { recreatePendingIfObligationUnmet: true });
  }

  // ── disputed → confirmed (rows 9 & 11) ───────────────────────
  if (from === 'disputed' && to === 'confirmed') {
    if (actor.type !== 'member') {
      return reject('disputes never auto-resolve — only humans close them (02 §d)');
    }
    if (actor.membershipId === record.payeeMembershipId) {
      // Row 9: payee late-confirms (« finalement reçu ») — party action,
      // available even when the payee is also the president.
      return allow('late_confirm');
    }
    if (actor.isPresident) {
      // Row 11: override always allowed, even when the president is a party
      // (UI badges « résolu par le président (partie au litige) »).
      return allow('override_confirm', { requiresNote: true });
    }
    return reject('only the payee (late-confirm) or the president (override) may resolve a dispute to confirmed');
  }

  // ── disputed → cancelled (rows 10 & 11) ──────────────────────
  if (from === 'disputed' && to === 'cancelled') {
    if (actor.type !== 'member') {
      return reject('disputes never auto-resolve — only humans close them (02 §d)');
    }
    if (actor.membershipId === record.payerMembershipId) {
      // Row 10: payer withdraws the claim — party action.
      return allow('withdraw_from_dispute', { recreatePendingIfObligationUnmet: true });
    }
    if (actor.isPresident) {
      return allow('override_cancel', {
        requiresNote: true,
        recreatePendingIfObligationUnmet: true,
      });
    }
    return reject('only the payer (withdraw) or the president (override) may resolve a dispute to cancelled');
  }

  return reject(`illegal transition: ${from} → ${to}`);
}

/** 01 §3.2's `canTransition(record, to, actor): boolean` — thin wrapper over validateTransition. */
export function canTransition(
  record: PaymentRecordSnapshot,
  to: PaymentState,
  actor: Actor,
  ctx: TransitionContext = {}
): boolean {
  return validateTransition(record, to, actor, ctx).ok;
}
