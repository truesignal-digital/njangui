import { describe, expect, test } from 'bun:test';

import {
  type Actor,
  DAY_MS,
  GRACE_DAYS_DEFAULT,
  GRACE_DAYS_MAX,
  GRACE_DAYS_MIN,
  HOUR_MS,
  LEGAL_TRANSITIONS,
  PAYMENT_STATES,
  type PaymentRecordSnapshot,
  type PaymentState,
  T_AUTO_CONFIRM,
  T_AUTO_DISPUTE,
  T_AUTO_DISPUTE_PAYOUT,
  T_CONFIRM_REMIND_1,
  T_CONFIRM_REMIND_2,
  T_DISPUTE_STALE,
  T_PAYOUT_STALE,
  autoDisputeFiresAt,
  autoDisputeWindowMs,
  canTransition,
  counterpartySideOf,
  isSelfRecord,
  membershipIdForSide,
  validateTransition,
} from './paymentStateMachine';

// ── fixtures ─────────────────────────────────────────────────

const PAYER_ID = 'm_payer';
const PAYEE_ID = 'm_payee';
const PRESIDENT_ID = 'm_president';
const OUTSIDER_ID = 'm_outsider';

const payer: Actor = { type: 'member', membershipId: PAYER_ID };
const payee: Actor = { type: 'member', membershipId: PAYEE_ID };
const president: Actor = { type: 'member', membershipId: PRESIDENT_ID, isPresident: true };
const outsider: Actor = { type: 'member', membershipId: OUTSIDER_ID };
const system: Actor = { type: 'system' };
const allActors = [payer, payee, president, outsider, system];

function record(overrides: Partial<PaymentRecordSnapshot> = {}): PaymentRecordSnapshot {
  return {
    state: 'pending',
    kind: 'contribution',
    payerMembershipId: PAYER_ID,
    payeeMembershipId: PAYEE_ID,
    ...overrides,
  };
}

function selfRecord(overrides: Partial<PaymentRecordSnapshot> = {}): PaymentRecordSnapshot {
  return record({ payerMembershipId: PAYER_ID, payeeMembershipId: PAYER_ID, ...overrides });
}

function expectEdge(
  result: ReturnType<typeof validateTransition>,
  edge: string
): Extract<ReturnType<typeof validateTransition>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok transition, got rejection: ${result.reason}`);
  expect(result.edge).toBe(edge as never);
  return result;
}

// ── timer constants (02 global timer table) ──────────────────

describe('timer constants', () => {
  test('match 02’s global timer table exactly', () => {
    expect(T_CONFIRM_REMIND_1).toBe(24 * HOUR_MS);
    expect(T_CONFIRM_REMIND_2).toBe(48 * HOUR_MS);
    expect(T_AUTO_DISPUTE).toBe(72 * HOUR_MS);
    expect(T_AUTO_DISPUTE_PAYOUT).toBe(7 * DAY_MS);
    expect(T_AUTO_CONFIRM).toBe(48 * HOUR_MS);
    expect(T_DISPUTE_STALE).toBe(7 * DAY_MS);
    expect(T_PAYOUT_STALE).toBe(7 * DAY_MS);
    expect(GRACE_DAYS_DEFAULT).toBe(2);
    expect(GRACE_DAYS_MIN).toBe(0);
    expect(GRACE_DAYS_MAX).toBe(7);
  });

  test('auto-dispute window is 72h for contributions/fines/assistance, 7d for payouts', () => {
    expect(autoDisputeWindowMs('contribution')).toBe(T_AUTO_DISPUTE);
    expect(autoDisputeWindowMs('fine')).toBe(T_AUTO_DISPUTE);
    expect(autoDisputeWindowMs('assistance')).toBe(T_AUTO_DISPUTE);
    expect(autoDisputeWindowMs('payout')).toBe(T_AUTO_DISPUTE_PAYOUT);
  });

  test('anchored auto-dispute fires at max(claimedAt + window, dueAt) — never before the réunion', () => {
    const claimedAt = 1_000_000;
    const lateDueAt = claimedAt + 10 * DAY_MS;
    // Early claim, réunion far away → anchored to dueAt.
    expect(autoDisputeFiresAt({ claimedAt, kind: 'contribution', dueAt: lateDueAt })).toBe(lateDueAt);
    // Claim after the réunion → window from claimedAt.
    expect(autoDisputeFiresAt({ claimedAt, kind: 'contribution', dueAt: claimedAt - DAY_MS })).toBe(
      claimedAt + T_AUTO_DISPUTE
    );
    // Payout kind uses the 7d window.
    expect(autoDisputeFiresAt({ claimedAt, kind: 'payout', dueAt: claimedAt - DAY_MS })).toBe(
      claimedAt + T_AUTO_DISPUTE_PAYOUT
    );
    // Round-less records (fine/assistance without a round): window alone.
    expect(autoDisputeFiresAt({ claimedAt, kind: 'fine' })).toBe(claimedAt + T_AUTO_DISPUTE);
  });
});

// ── helpers ──────────────────────────────────────────────────

describe('helpers', () => {
  test('isSelfRecord detects payer === payee', () => {
    expect(isSelfRecord(record())).toBe(false);
    expect(isSelfRecord(selfRecord())).toBe(true);
  });

  test('counterpartySideOf / membershipIdForSide', () => {
    expect(counterpartySideOf('payer')).toBe('payee');
    expect(counterpartySideOf('payee')).toBe('payer');
    expect(membershipIdForSide(record(), 'payer')).toBe(PAYER_ID);
    expect(membershipIdForSide(record(), 'payee')).toBe(PAYEE_ID);
  });
});

// ── every structurally illegal transition is rejected for every actor ──

describe('illegal transitions', () => {
  test('every (from, to) pair outside the transition map is rejected for every actor', () => {
    for (const from of PAYMENT_STATES) {
      for (const to of PAYMENT_STATES) {
        if (from !== to && LEGAL_TRANSITIONS[from].includes(to)) continue;
        const rec = record({
          state: from,
          // claimed/disputed records always carry a side in real data.
          claimedBySide: from === 'claimed' || from === 'disputed' ? 'payer' : undefined,
        });
        for (const actor of allActors) {
          expect(canTransition(rec, to as PaymentState, actor)).toBe(false);
          expect(
            canTransition(rec, to as PaymentState, actor, { counterpartyNeedsRepresentation: true })
          ).toBe(false);
        }
      }
    }
  });

  test('confirmed is ledger-final — even the president cannot transition it (02 §c row 12 is an amendment, not a transition)', () => {
    const confirmed = record({ state: 'confirmed', claimedBySide: 'payer' });
    for (const to of ['pending', 'claimed', 'disputed', 'cancelled'] as const) {
      const result = validateTransition(confirmed, to, president);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('ledger-final');
    }
  });

  test('cancelled is terminal', () => {
    const cancelled = record({ state: 'cancelled' });
    for (const to of PAYMENT_STATES) {
      for (const actor of allActors) {
        expect(canTransition(cancelled, to, actor)).toBe(false);
      }
    }
  });

  test('same-state "transitions" are rejected (idempotent re-taps belong to the mutation layer)', () => {
    expect(canTransition(record({ state: 'pending' }), 'pending', system)).toBe(false);
    expect(canTransition(record({ state: 'claimed', claimedBySide: 'payer' }), 'claimed', payer)).toBe(false);
  });

  test('pending can never go straight to disputed', () => {
    for (const actor of allActors) {
      expect(canTransition(record(), 'disputed', actor)).toBe(false);
    }
  });
});

// ── rows 2–3: pending → claimed ──────────────────────────────

describe('pending → claimed (rows 2–3)', () => {
  test('payer claims (« j’ai envoyé ») → claimedBySide payer', () => {
    const result = expectEdge(validateTransition(record(), 'claimed', payer), 'claim_payer');
    expect(result.setsClaimedBySide).toBe('payer');
    expect(result.requiresNote).toBe(false);
    expect(result.skipsTimers).toBe(false);
  });

  test('payee claims (Meeting Mode tick / « j’ai reçu ») → claimedBySide payee', () => {
    const result = expectEdge(validateTransition(record(), 'claimed', payee), 'claim_payee');
    expect(result.setsClaimedBySide).toBe('payee');
  });

  test('non-party member, president, and system cannot claim', () => {
    expect(canTransition(record(), 'claimed', outsider)).toBe(false);
    expect(canTransition(record(), 'claimed', president)).toBe(false);
    expect(canTransition(record(), 'claimed', system)).toBe(false);
  });

  test('self-records cannot enter claimed — they confirm in a single mutation', () => {
    const result = validateTransition(selfRecord(), 'claimed', payer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('self-record');
  });
});

// ── self-record rule: pending → confirmed ────────────────────

describe('self-record pending → confirmed (payer = payee, single mutation)', () => {
  test('holder records own payment — direct to confirmed, no timers', () => {
    const result = expectEdge(
      validateTransition(selfRecord(), 'confirmed', payer),
      'self_record_confirm'
    );
    expect(result.skipsTimers).toBe(true);
    expect(result.requiresNote).toBe(false);
  });

  test('non-self records can never go pending → confirmed, for any actor', () => {
    for (const actor of allActors) {
      expect(canTransition(record(), 'confirmed', actor)).toBe(false);
    }
  });

  test('only the holder may confirm a self-record — not president, outsider, or system', () => {
    expect(canTransition(selfRecord(), 'confirmed', president)).toBe(false);
    expect(canTransition(selfRecord(), 'confirmed', outsider)).toBe(false);
    expect(canTransition(selfRecord(), 'confirmed', system)).toBe(false);
  });

  test('a pending self-record can still be cancelled by the system (row 13 applies)', () => {
    expect(canTransition(selfRecord(), 'cancelled', system)).toBe(true);
  });
});

// ── row 13: pending → cancelled ──────────────────────────────

describe('pending → cancelled (row 13)', () => {
  test('system bulk-cancel (skip, exit, cancelled round, dissolution) — no note', () => {
    const result = expectEdge(validateTransition(record(), 'cancelled', system), 'cancel_obligation');
    expect(result.requiresNote).toBe(false);
  });

  test('president cancel requires a mandatory note', () => {
    const result = expectEdge(validateTransition(record(), 'cancelled', president), 'cancel_obligation');
    expect(result.requiresNote).toBe(true);
  });

  test('payer, payee, and outsiders cannot cancel a pending obligation', () => {
    expect(canTransition(record(), 'cancelled', payer)).toBe(false);
    expect(canTransition(record(), 'cancelled', payee)).toBe(false);
    expect(canTransition(record(), 'cancelled', outsider)).toBe(false);
  });
});

// ── rows 4–5: claimed → confirmed ────────────────────────────

describe('claimed → confirmed (rows 4–5)', () => {
  const payerClaim = record({ state: 'claimed', claimedBySide: 'payer' });
  const payeeClaim = record({ state: 'claimed', claimedBySide: 'payee' });

  test('payee confirms a payer-side claim', () => {
    expectEdge(validateTransition(payerClaim, 'confirmed', payee), 'confirm_by_counterparty');
  });

  test('payer confirms a payee-side claim (« C’est exact » after Meeting Mode tick)', () => {
    expectEdge(validateTransition(payeeClaim, 'confirmed', payer), 'confirm_by_counterparty');
  });

  test('no self-confirmation: the claimant cannot confirm their own claim', () => {
    expect(canTransition(payerClaim, 'confirmed', payer)).toBe(false);
    expect(canTransition(payeeClaim, 'confirmed', payee)).toBe(false);
  });

  test('a president who is the claimant can never confirm — even with the on-behalf flag (the paying treasurer-president payout case)', () => {
    const presidentClaim = record({
      state: 'claimed',
      kind: 'payout',
      payerMembershipId: PRESIDENT_ID,
      claimedBySide: 'payer',
    });
    expect(
      canTransition(presidentClaim, 'confirmed', president, { counterpartyNeedsRepresentation: true })
    ).toBe(false);
  });

  test('president confirms on behalf of an unrepresented counterparty (hasAccount:false / exited / deceased) — mandatory note', () => {
    const result = expectEdge(
      validateTransition(payerClaim, 'confirmed', president, { counterpartyNeedsRepresentation: true }),
      'confirm_on_behalf'
    );
    expect(result.requiresNote).toBe(true);
  });

  test('president cannot on-behalf-confirm when the counterparty can act for itself', () => {
    expect(canTransition(payerClaim, 'confirmed', president)).toBe(false);
    expect(
      canTransition(payerClaim, 'confirmed', president, { counterpartyNeedsRepresentation: false })
    ).toBe(false);
  });

  test('a president who IS the counterparty confirms as ordinary counterparty', () => {
    const rec = record({ state: 'claimed', claimedBySide: 'payer', payeeMembershipId: PRESIDENT_ID });
    expectEdge(validateTransition(rec, 'confirmed', president), 'confirm_by_counterparty');
  });

  test('outsiders can never confirm', () => {
    expect(canTransition(payerClaim, 'confirmed', outsider)).toBe(false);
    expect(canTransition(payeeClaim, 'confirmed', outsider)).toBe(false);
  });

  test('auto-confirm (T_AUTO_CONFIRM) applies to payee-side claims only', () => {
    expectEdge(validateTransition(payeeClaim, 'confirmed', system), 'auto_confirm');
    // A silent feature-phone payer auto-confirms — never the reverse:
    expect(canTransition(payerClaim, 'confirmed', system)).toBe(false);
  });

  test('claimed record without claimedBySide is a data error — rejected', () => {
    const broken = record({ state: 'claimed' });
    const result = validateTransition(broken, 'confirmed', payee);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('claimedBySide');
  });
});

// ── rows 6–7: claimed → disputed ─────────────────────────────

describe('claimed → disputed (rows 6–7)', () => {
  const payerClaim = record({ state: 'claimed', claimedBySide: 'payer' });
  const payeeClaim = record({ state: 'claimed', claimedBySide: 'payee' });

  test('payee disputes a payer-side claim (« Je n’ai pas reçu ») — mandatory reason', () => {
    const result = expectEdge(validateTransition(payerClaim, 'disputed', payee), 'dispute_by_counterparty');
    expect(result.requiresReason).toBe(true);
  });

  test('payer disputes a payee-side claim (objects to a Meeting Mode tick)', () => {
    const result = expectEdge(validateTransition(payeeClaim, 'disputed', payer), 'dispute_by_counterparty');
    expect(result.requiresReason).toBe(true);
  });

  test('the claimant cannot dispute their own claim (withdraw instead)', () => {
    expect(canTransition(payerClaim, 'disputed', payer)).toBe(false);
    expect(canTransition(payeeClaim, 'disputed', payee)).toBe(false);
  });

  test('president disputes on behalf of an unrepresented counterparty (symmetric objection right) — reason still required', () => {
    const result = expectEdge(
      validateTransition(payeeClaim, 'disputed', president, { counterpartyNeedsRepresentation: true }),
      'dispute_on_behalf'
    );
    expect(result.requiresReason).toBe(true);
  });

  test('president cannot on-behalf-dispute for a self-capable counterparty; outsiders never', () => {
    expect(canTransition(payerClaim, 'disputed', president)).toBe(false);
    expect(canTransition(payerClaim, 'disputed', outsider)).toBe(false);
  });

  test('auto-dispute applies to payer-side claims only — payee-side claims never rot into dispute', () => {
    expectEdge(validateTransition(payerClaim, 'disputed', system), 'auto_dispute');
    expect(canTransition(payeeClaim, 'disputed', system)).toBe(false);
  });
});

// ── row 8: claimed → cancelled (withdraw) ────────────────────

describe('claimed → cancelled (row 8 — claimant withdraws)', () => {
  const payerClaim = record({ state: 'claimed', claimedBySide: 'payer' });
  const payeeClaim = record({ state: 'claimed', claimedBySide: 'payee' });

  test('the claimant withdraws their own claim (« Je me suis trompé ») — obligation re-created if unmet', () => {
    const fromPayer = expectEdge(validateTransition(payerClaim, 'cancelled', payer), 'withdraw_claim');
    expect(fromPayer.recreatePendingIfObligationUnmet).toBe(true);
    const fromPayee = expectEdge(validateTransition(payeeClaim, 'cancelled', payee), 'withdraw_claim');
    expect(fromPayee.recreatePendingIfObligationUnmet).toBe(true);
  });

  test('the counterparty, president, system, and outsiders cannot withdraw someone else’s claim', () => {
    expect(canTransition(payerClaim, 'cancelled', payee)).toBe(false);
    expect(canTransition(payeeClaim, 'cancelled', payer)).toBe(false);
    expect(canTransition(payerClaim, 'cancelled', president)).toBe(false);
    expect(canTransition(payerClaim, 'cancelled', system)).toBe(false);
    expect(canTransition(payerClaim, 'cancelled', outsider)).toBe(false);
  });
});

// ── rows 9–11: disputed exits ────────────────────────────────

describe('disputed → confirmed (rows 9 & 11)', () => {
  const disputed = record({ state: 'disputed', claimedBySide: 'payer' });

  test('payee late-confirms (« finalement reçu ») — party action, no note required', () => {
    const result = expectEdge(validateTransition(disputed, 'confirmed', payee), 'late_confirm');
    expect(result.requiresNote).toBe(false);
  });

  test('president override → confirmed — mandatory note', () => {
    const result = expectEdge(validateTransition(disputed, 'confirmed', president), 'override_confirm');
    expect(result.requiresNote).toBe(true);
  });

  test('president override allowed even when the president is a party (row 11)', () => {
    const presidentIsPayer = record({
      state: 'disputed',
      payerMembershipId: PRESIDENT_ID,
      claimedBySide: 'payer',
    });
    expectEdge(validateTransition(presidentIsPayer, 'confirmed', president), 'override_confirm');
  });

  test('payer, outsider, and system cannot resolve to confirmed', () => {
    expect(canTransition(disputed, 'confirmed', payer)).toBe(false);
    expect(canTransition(disputed, 'confirmed', outsider)).toBe(false);
    expect(canTransition(disputed, 'confirmed', system)).toBe(false); // disputes never auto-resolve
  });
});

describe('disputed → cancelled (rows 10 & 11)', () => {
  const disputed = record({ state: 'disputed', claimedBySide: 'payer' });

  test('payer withdraws the claim — obligation re-created if unmet', () => {
    const result = expectEdge(validateTransition(disputed, 'cancelled', payer), 'withdraw_from_dispute');
    expect(result.recreatePendingIfObligationUnmet).toBe(true);
    expect(result.requiresNote).toBe(false);
  });

  test('president override → cancelled — mandatory note, obligation re-created if unmet', () => {
    const result = expectEdge(validateTransition(disputed, 'cancelled', president), 'override_cancel');
    expect(result.requiresNote).toBe(true);
    expect(result.recreatePendingIfObligationUnmet).toBe(true);
  });

  test('a president who is the payer resolves as the party (withdraw), not as override', () => {
    const presidentIsPayer = record({
      state: 'disputed',
      payerMembershipId: PRESIDENT_ID,
      claimedBySide: 'payer',
    });
    expectEdge(validateTransition(presidentIsPayer, 'cancelled', president), 'withdraw_from_dispute');
  });

  test('payee, outsider, and system cannot resolve to cancelled', () => {
    expect(canTransition(disputed, 'cancelled', payee)).toBe(false);
    expect(canTransition(disputed, 'cancelled', outsider)).toBe(false);
    expect(canTransition(disputed, 'cancelled', system)).toBe(false); // disputes never auto-resolve
  });
});

// ── disputed exits for PAYEE-SIDE claims (Meeting Mode) ──────
// Rows 9/10 are claimant-relative, not hardcoded payer/payee: when the
// treasurer's roll-call tick is disputed by the payer, the claimant must
// never be able to confirm their own contested claim (row 4's
// no-self-confirmation rule), and only the claimant withdraws.

describe('disputed exits — payee-side claims (Meeting Mode)', () => {
  const disputed = record({ state: 'disputed', claimedBySide: 'payee' });

  test('the disputing PAYER (counterparty) late-confirms — « c’est exact finalement »', () => {
    const result = expectEdge(validateTransition(disputed, 'confirmed', payer), 'late_confirm');
    expect(result.requiresNote).toBe(false);
  });

  test('the claimant payee can NEVER confirm their own contested claim', () => {
    expect(canTransition(disputed, 'confirmed', payee)).toBe(false);
  });

  test('only the claimant payee withdraws — the disputing payer cannot cancel the other side’s claim', () => {
    const result = expectEdge(validateTransition(disputed, 'cancelled', payee), 'withdraw_from_dispute');
    expect(result.recreatePendingIfObligationUnmet).toBe(true);
    expect(canTransition(disputed, 'cancelled', payer)).toBe(false);
  });

  test('president override stays available on both exits — mandatory note', () => {
    expectEdge(validateTransition(disputed, 'confirmed', president), 'override_confirm');
    expectEdge(validateTransition(disputed, 'cancelled', president), 'override_cancel');
  });

  test('a disputed record missing claimedBySide is rejected (data integrity)', () => {
    const broken = record({ state: 'disputed', claimedBySide: undefined });
    expect(canTransition(broken, 'confirmed', payer)).toBe(false);
    expect(canTransition(broken, 'confirmed', president)).toBe(false);
    expect(canTransition(broken, 'cancelled', payee)).toBe(false);
  });
});
