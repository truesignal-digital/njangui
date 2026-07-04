// ─────────────────────────────────────────────────────────────
// Round math — pure ledger arithmetic for the Cycle/Round engine.
//
// Source of truth: docs/02-lifecycle-state-machines.md §b (opening
// rules, closing rules) and §a (cycle lock). 01 §3.1 (rounds notes)
// is the schema-level projection.
//
// NO Convex imports here — plain TypeScript so the math is
// unit-testable (colocated roundMath.test.ts) and every mutation
// calls the same single source of truth, exactly like
// paymentStateMachine.ts.
//
// All money is integer XAF. All timestamps are ms epoch.
// ─────────────────────────────────────────────────────────────

import { DAY_MS, HOUR_MS } from './paymentStateMachine';

// Literal types mirror the exported validators in convex/schema.ts
// (scheduleValidator, obligationStatusValidator, paymentStateValidator).
export type Schedule = 'weekly' | 'biweekly' | 'monthly';

export type ObligationStatus = 'on_time' | 'late' | 'partial' | 'unpaid' | 'disputed';

export type ObligationRecordState =
  | 'pending'
  | 'claimed'
  | 'confirmed'
  | 'disputed'
  | 'cancelled';

// ─────────────────────────────────────────────────────────────
// Calendar arithmetic — Africa/Douala (WAT, UTC+1, no DST),
// the single timezone every réunion runs in (01: meetingTime is
// 'HH:mm', Africa/Douala).
// ─────────────────────────────────────────────────────────────

export const DOUALA_UTC_OFFSET_MS = HOUR_MS;

/**
 * When the group set no meetingTime, the whole due day counts: a claim
 * logged any time on réunion day is on-time (timeliness is claimedAt ≤
 * dueAt, 02 §b closing rule 1 — a missing clock time must never mark a
 * same-day payer « late »).
 */
export const DEFAULT_DUE_TIME = '23:59';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // 'HH:mm'

/** Calendar date in the Douala civil calendar. `month` is 1–12. */
export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month = last day of this month (UTC, no DST surprises).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseIsoDate(date: string): IsoDateParts {
  const match = ISO_DATE_RE.exec(date);
  if (!match) {
    throw new Error(`Invalid date '${date}' — expected YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid calendar date '${date}'`);
  }
  return { year, month, day };
}

/** 0–6 (Sun–Sat), matching groups.meetingDayOfWeek. */
export function dayOfWeekOf(parts: IsoDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** ms epoch of `parts` at `time` ('HH:mm') on the Douala wall clock. */
export function doualaTimestamp(parts: IsoDateParts, time: string): number {
  if (!TIME_RE.test(time)) {
    throw new Error(`Invalid time '${time}' — expected HH:mm`);
  }
  const [hours, minutes] = time.split(':').map(Number);
  return Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes) - DOUALA_UTC_OFFSET_MS;
}

export function addDays(parts: IsoDateParts, days: number): IsoDateParts {
  // Date.UTC normalizes day overflow across month/year boundaries.
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Month stepping with month-end clamping that ALWAYS re-derives from the
 * original anchor day (01 §3.1 rounds: "monthly = same day-of-month clamped
 * to month end"): a monthly cycle starting Jan 31 runs
 * Jan 31 → Feb 28 → Mar 31 → Apr 30 — never decaying to the 28th forever.
 */
export function addMonthsClamped(anchor: IsoDateParts, months: number): IsoDateParts {
  const zeroBased = anchor.month - 1 + months;
  const year = anchor.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { year, month, day: Math.min(anchor.day, daysInMonth(year, month)) };
}

// ─────────────────────────────────────────────────────────────
// Round timer fields (02 §b opening rules)
// ─────────────────────────────────────────────────────────────

export interface RoundTimesInput {
  schedule: Schedule;
  /** Round 1's réunion date (cycles.startDate, YYYY-MM-DD, Douala). */
  startDate: string;
  /** 'HH:mm' Douala; absent ⇒ DEFAULT_DUE_TIME (whole due day on-time). */
  meetingTime?: string;
  /** Snapshot of groups.graceDays at lock (cycles.graceDays). */
  graceDays: number;
  /** 1-based position within the cycle. */
  roundIndex: number;
}

export interface RoundTimes {
  scheduledOpenAt: number;
  dueAt: number;
  graceEndAt: number;
}

/**
 * 02 §b DECISION: `scheduledOpenAt` = start of the period (monthly with a
 * réunion on the 28th opens on the 1st so members can pay any time during
 * the month; weekly/biweekly open one period before the réunion);
 * `dueAt` = réunion date/time; `graceEndAt = dueAt + GRACE_DAYS`.
 */
export function computeRoundTimes(input: RoundTimesInput): RoundTimes {
  if (!Number.isInteger(input.roundIndex) || input.roundIndex < 1) {
    throw new Error('roundIndex must be a positive integer (1-based)');
  }
  if (!Number.isInteger(input.graceDays) || input.graceDays < 0) {
    throw new Error('graceDays must be a non-negative integer');
  }

  const start = parseIsoDate(input.startDate);
  const time = input.meetingTime ?? DEFAULT_DUE_TIME;

  let dueParts: IsoDateParts;
  let scheduledOpenAt: number;
  if (input.schedule === 'monthly') {
    dueParts = addMonthsClamped(start, input.roundIndex - 1);
    scheduledOpenAt = doualaTimestamp({ ...dueParts, day: 1 }, '00:00');
  } else {
    const periodDays = input.schedule === 'weekly' ? 7 : 14;
    dueParts = addDays(start, periodDays * (input.roundIndex - 1));
    scheduledOpenAt = doualaTimestamp(dueParts, time) - periodDays * DAY_MS;
  }

  const dueAt = doualaTimestamp(dueParts, time);
  return { scheduledOpenAt, dueAt, graceEndAt: dueAt + input.graceDays * DAY_MS };
}

// ─────────────────────────────────────────────────────────────
// Obligation set & pot (02 §b opening rules, 05 M8)
// ─────────────────────────────────────────────────────────────

/**
 * Hands per membership = occurrences in the LOCKED rotation order (02 §b
 * « deux mains » : a membership appearing N times holds N positions —
 * N beneficiary rounds, and N× the contribution each round). The rotation
 * order is immutable after lock (I-4), so hand counts are stable for the
 * whole cycle even after order swaps/removals (those re-point rounds, they
 * never rewrite the order).
 */
export function handsByMembership<T extends string>(
  rotationOrder: readonly T[]
): Map<T, number> {
  const hands = new Map<T, number>();
  for (const id of rotationOrder) {
    hands.set(id, (hands.get(id) ?? 0) + 1);
  }
  return hands;
}

/**
 * Per-member expected contribution for one round: base amount × hands
 * held, minus ONE hand when the member is the round's beneficiary and the
 * cycle snapshot says the beneficiary sits out their own round — each hand
 * is a position, so only the benefiting hand rests and the others still
 * owe (02 §b). 0 ⇒ no obligation this round (the single-hand beneficiary
 * with beneficiaryContributes:false — exactly today's exclusion).
 */
export function expectedContributionAmount(input: {
  hands: number;
  isBeneficiary: boolean;
  beneficiaryContributes: boolean;
  contributionAmount: number;
}): number {
  const resting = input.isBeneficiary && !input.beneficiaryContributes ? 1 : 0;
  return Math.max(0, input.hands - resting) * input.contributionAmount;
}

/**
 * Who owes a contribution this round: every active, non-joinedMidCycle
 * member (the caller pre-filters those — 02 §b guard / edge case 4),
 * minus the beneficiary when the cycle snapshot says they sit out their
 * own round (`beneficiaryContributes: false`).
 */
export function obligatedContributorIds<T extends string>(
  activeMemberIds: readonly T[],
  beneficiaryMembershipId: T,
  beneficiaryContributes: boolean
): T[] {
  if (beneficiaryContributes) {
    return [...activeMemberIds];
  }
  return activeMemberIds.filter((id) => id !== beneficiaryMembershipId);
}

/**
 * Payout prefill = obligated members × contribution (05 M8 / 01 §3.1
 * pre-creation note). A PREFILL only: the treasurer edits the amount at
 * claim time — the app records reality, never asserts an owed amount.
 */
export function payoutPrefillAmount(
  obligatedContributorCount: number,
  contributionAmount: number
): number {
  if (!Number.isInteger(obligatedContributorCount) || obligatedContributorCount < 0) {
    throw new Error('obligatedContributorCount must be a non-negative integer');
  }
  if (!Number.isInteger(contributionAmount) || contributionAmount <= 0) {
    throw new Error('contributionAmount must be a positive whole number of XAF');
  }
  return obligatedContributorCount * contributionAmount;
}

/** The slice of a paymentRecords row the round math needs. */
export interface ObligationRecordSnapshot {
  state: ObligationRecordState;
  amount: number;
  claimedAt?: number;
}

export interface PotProgress {
  /** Sum of `confirmed` records — the only ledger-final money (truth = payee confirmation). */
  confirmedAmount: number;
  /** Sum of `claimed` + `disputed` records — asserted but not yet acknowledged. */
  inFlightAmount: number;
}

export function computePotProgress(records: readonly ObligationRecordSnapshot[]): PotProgress {
  let confirmedAmount = 0;
  let inFlightAmount = 0;
  for (const record of records) {
    if (record.state === 'confirmed') {
      confirmedAmount += record.amount;
    } else if (record.state === 'claimed' || record.state === 'disputed') {
      inFlightAmount += record.amount;
    }
  }
  return { confirmedAmount, inFlightAmount };
}

// ─────────────────────────────────────────────────────────────
// Obligation-status freezing (02 §b closing rule 1)
// ─────────────────────────────────────────────────────────────

/**
 * One member's obligation status at round close, computed from records
 * CLAIMED by close and measured on `claimedAt` (DECISION: timeliness =
 * when the money was handed over, not confirmedAt — confirmation may lag
 * for innocent reasons):
 *
 * - `disputed` — any of the member's records is in dispute at close.
 * - `on_time` — claims with `claimedAt ≤ dueAt` cover the expected amount
 *   (an extra late top-up never downgrades a member already covered on time).
 * - `late`    — covered overall, but only with some claim after `dueAt`.
 * - `partial` — claimed sum > 0 but short.
 * - `unpaid`  — zero claimed.
 *
 * `pending` records contribute nothing (they become arrears — closing
 * rule 2); `cancelled` records are ignored. In-flight `claimed` records
 * count with their `claimedAt` per the provisional-status rule — a member
 * whose treasurer hadn't confirmed by close is never marked down for it.
 */
export function freezeObligationStatus(
  records: readonly ObligationRecordSnapshot[],
  expectedAmount: number,
  dueAt: number
): ObligationStatus {
  if (records.some((r) => r.state === 'disputed')) {
    return 'disputed';
  }

  let onTimeSum = 0;
  let claimedSum = 0;
  for (const record of records) {
    if (record.state !== 'claimed' && record.state !== 'confirmed') continue;
    if (record.claimedAt === undefined) continue;
    claimedSum += record.amount;
    if (record.claimedAt <= dueAt) {
      onTimeSum += record.amount;
    }
  }

  if (onTimeSum >= expectedAmount) return 'on_time';
  if (claimedSum >= expectedAmount) return 'late';
  if (claimedSum > 0) return 'partial';
  return 'unpaid';
}
