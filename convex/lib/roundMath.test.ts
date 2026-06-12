import { describe, expect, test } from 'bun:test';

import { DAY_MS, HOUR_MS } from './paymentStateMachine';
import {
  DEFAULT_DUE_TIME,
  DOUALA_UTC_OFFSET_MS,
  type IsoDateParts,
  type ObligationRecordSnapshot,
  addDays,
  addMonthsClamped,
  computePotProgress,
  computeRoundTimes,
  dayOfWeekOf,
  daysInMonth,
  doualaTimestamp,
  freezeObligationStatus,
  obligatedContributorIds,
  parseIsoDate,
  payoutPrefillAmount,
} from './roundMath';

// ── calendar primitives ──────────────────────────────────────

describe('calendar primitives', () => {
  test('parseIsoDate accepts valid dates and rejects garbage', () => {
    expect(parseIsoDate('2026-01-31')).toEqual({ year: 2026, month: 1, day: 31 });
    expect(() => parseIsoDate('2026-1-31')).toThrow();
    expect(() => parseIsoDate('31-01-2026')).toThrow();
    expect(() => parseIsoDate('2026-02-30')).toThrow(); // not a real day
    expect(() => parseIsoDate('2026-13-01')).toThrow();
  });

  test('daysInMonth handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29); // leap
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  test('doualaTimestamp is UTC+1 (WAT, no DST)', () => {
    // 18:00 in Douala = 17:00 UTC.
    expect(doualaTimestamp({ year: 2026, month: 1, day: 31 }, '18:00')).toBe(
      Date.UTC(2026, 0, 31, 17, 0)
    );
    expect(DOUALA_UTC_OFFSET_MS).toBe(HOUR_MS);
    expect(() => doualaTimestamp({ year: 2026, month: 1, day: 31 }, '24:00')).toThrow();
  });

  test('addDays crosses month and year boundaries', () => {
    expect(addDays({ year: 2026, month: 12, day: 28 }, 7)).toEqual({
      year: 2027,
      month: 1,
      day: 4,
    });
  });

  test('addMonthsClamped clamps to month end from the ORIGINAL anchor day', () => {
    const jan31: IsoDateParts = { year: 2026, month: 1, day: 31 };
    expect(addMonthsClamped(jan31, 1)).toEqual({ year: 2026, month: 2, day: 28 });
    // Anchor day 31 resurfaces in March — never decays to the 28th forever.
    expect(addMonthsClamped(jan31, 2)).toEqual({ year: 2026, month: 3, day: 31 });
    expect(addMonthsClamped(jan31, 3)).toEqual({ year: 2026, month: 4, day: 30 });
    // Year rollover.
    expect(addMonthsClamped({ year: 2026, month: 11, day: 30 }, 3)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
    // Leap February keeps the 29th.
    expect(addMonthsClamped({ year: 2028, month: 1, day: 31 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  test('dayOfWeekOf matches groups.meetingDayOfWeek convention (0=Sun)', () => {
    expect(dayOfWeekOf({ year: 2026, month: 6, day: 14 })).toBe(0); // Sunday
    expect(dayOfWeekOf({ year: 2026, month: 6, day: 15 })).toBe(1); // Monday
  });
});

// ── round timer fields (02 §b) ───────────────────────────────

describe('computeRoundTimes — weekly/biweekly', () => {
  const startDate = '2026-06-14'; // a Sunday réunion
  const base = { schedule: 'weekly' as const, startDate, meetingTime: '15:00', graceDays: 2 };

  test('weekly rounds step 7 days and keep the meeting day-of-week', () => {
    const round1 = computeRoundTimes({ ...base, roundIndex: 1 });
    const round2 = computeRoundTimes({ ...base, roundIndex: 2 });
    const round5 = computeRoundTimes({ ...base, roundIndex: 5 });

    expect(round1.dueAt).toBe(doualaTimestamp(parseIsoDate('2026-06-14'), '15:00'));
    expect(round2.dueAt - round1.dueAt).toBe(7 * DAY_MS);
    expect(round5.dueAt - round1.dueAt).toBe(28 * DAY_MS);
    expect(dayOfWeekOf(parseIsoDate('2026-06-14'))).toBe(0);
  });

  test('scheduledOpenAt is one period before the réunion (start of the period)', () => {
    const round2 = computeRoundTimes({ ...base, roundIndex: 2 });
    expect(round2.scheduledOpenAt).toBe(round2.dueAt - 7 * DAY_MS);

    const biweekly = computeRoundTimes({ ...base, schedule: 'biweekly', roundIndex: 3 });
    expect(biweekly.scheduledOpenAt).toBe(biweekly.dueAt - 14 * DAY_MS);
    // Biweekly round 3 = start + 28 days.
    expect(biweekly.dueAt).toBe(doualaTimestamp(parseIsoDate('2026-07-12'), '15:00'));
  });

  test('graceEndAt = dueAt + graceDays; graceDays 0 closes at the réunion', () => {
    const round1 = computeRoundTimes({ ...base, roundIndex: 1 });
    expect(round1.graceEndAt).toBe(round1.dueAt + 2 * DAY_MS);

    const strict = computeRoundTimes({ ...base, graceDays: 0, roundIndex: 1 });
    expect(strict.graceEndAt).toBe(strict.dueAt);
  });

  test('missing meetingTime defaults so the whole due day is on-time', () => {
    const round1 = computeRoundTimes({ ...base, meetingTime: undefined, roundIndex: 1 });
    expect(round1.dueAt).toBe(doualaTimestamp(parseIsoDate(startDate), DEFAULT_DUE_TIME));
  });

  test('rejects invalid roundIndex and graceDays', () => {
    expect(() => computeRoundTimes({ ...base, roundIndex: 0 })).toThrow();
    expect(() => computeRoundTimes({ ...base, roundIndex: 1.5 })).toThrow();
    expect(() => computeRoundTimes({ ...base, graceDays: -1, roundIndex: 1 })).toThrow();
  });
});

describe('computeRoundTimes — monthly (month-end edge cases)', () => {
  const base = {
    schedule: 'monthly' as const,
    startDate: '2026-01-31', // monthly cycle starting Jan 31 — the canonical clamp case
    meetingTime: '18:00',
    graceDays: 2,
  };

  test('clamps Feb to the 28th, returns to the 31st in March', () => {
    expect(computeRoundTimes({ ...base, roundIndex: 1 }).dueAt).toBe(
      doualaTimestamp(parseIsoDate('2026-01-31'), '18:00')
    );
    expect(computeRoundTimes({ ...base, roundIndex: 2 }).dueAt).toBe(
      doualaTimestamp(parseIsoDate('2026-02-28'), '18:00')
    );
    expect(computeRoundTimes({ ...base, roundIndex: 3 }).dueAt).toBe(
      doualaTimestamp(parseIsoDate('2026-03-31'), '18:00')
    );
    expect(computeRoundTimes({ ...base, roundIndex: 4 }).dueAt).toBe(
      doualaTimestamp(parseIsoDate('2026-04-30'), '18:00')
    );
  });

  test('opens on the 1st of the réunion month at 00:00 Douala (02 §b DECISION)', () => {
    const round2 = computeRoundTimes({ ...base, roundIndex: 2 });
    expect(round2.scheduledOpenAt).toBe(
      doualaTimestamp({ year: 2026, month: 2, day: 1 }, '00:00')
    );
    // 13th round crosses the year boundary: Jan 31 2027.
    const round13 = computeRoundTimes({ ...base, roundIndex: 13 });
    expect(round13.dueAt).toBe(doualaTimestamp(parseIsoDate('2027-01-31'), '18:00'));
    expect(round13.scheduledOpenAt).toBe(
      doualaTimestamp({ year: 2027, month: 1, day: 1 }, '00:00')
    );
  });
});

// ── obligation set & pot ─────────────────────────────────────

describe('obligatedContributorIds — 2-member group, beneficiaryContributes on/off', () => {
  const members = ['m_a', 'm_b'];

  test('beneficiaryContributes=true: everyone owes, including the beneficiary', () => {
    expect(obligatedContributorIds(members, 'm_a', true)).toEqual(['m_a', 'm_b']);
  });

  test('beneficiaryContributes=false: the beneficiary sits out their own round', () => {
    expect(obligatedContributorIds(members, 'm_a', false)).toEqual(['m_b']);
  });
});

describe('payoutPrefillAmount', () => {
  test('obligated members × contribution — 2-member group both modes', () => {
    expect(payoutPrefillAmount(2, 5000)).toBe(10_000); // beneficiary contributes
    expect(payoutPrefillAmount(1, 5000)).toBe(5000); // beneficiary sits out
  });

  test('rejects non-integer money', () => {
    expect(() => payoutPrefillAmount(2, 0)).toThrow();
    expect(() => payoutPrefillAmount(2, 2500.5)).toThrow();
    expect(() => payoutPrefillAmount(-1, 5000)).toThrow();
  });
});

describe('computePotProgress', () => {
  test('confirmed vs in-flight, pending and cancelled excluded', () => {
    const records: ObligationRecordSnapshot[] = [
      { state: 'confirmed', amount: 5000, claimedAt: 1 },
      { state: 'confirmed', amount: 5000, claimedAt: 2 },
      { state: 'claimed', amount: 5000, claimedAt: 3 },
      { state: 'disputed', amount: 2500, claimedAt: 4 },
      { state: 'pending', amount: 5000 },
      { state: 'cancelled', amount: 5000 },
    ];
    expect(computePotProgress(records)).toEqual({
      confirmedAmount: 10_000,
      inFlightAmount: 7500,
    });
  });
});

// ── obligation-status freezing (02 §b closing rule 1) ────────

describe('freezeObligationStatus', () => {
  const EXPECTED = 10_000;
  const DUE_AT = doualaTimestamp(parseIsoDate('2026-06-14'), '15:00');
  const ON_TIME = DUE_AT - 3 * DAY_MS;
  const LATE = DUE_AT + 6 * HOUR_MS; // during grace — grace delays close, never extends timeliness

  test('on_time: on-time claims cover the expected amount', () => {
    expect(
      freezeObligationStatus(
        [{ state: 'confirmed', amount: 10_000, claimedAt: ON_TIME }],
        EXPECTED,
        DUE_AT
      )
    ).toBe('on_time');
  });

  test('claimedAt exactly at dueAt is on_time (≤, not <)', () => {
    expect(
      freezeObligationStatus(
        [{ state: 'claimed', amount: 10_000, claimedAt: DUE_AT }],
        EXPECTED,
        DUE_AT
      )
    ).toBe('on_time');
  });

  test('in-flight claimed counts by claimedAt — slow treasurer confirmation never marks the payer down', () => {
    expect(
      freezeObligationStatus(
        [{ state: 'claimed', amount: 10_000, claimedAt: ON_TIME }],
        EXPECTED,
        DUE_AT
      )
    ).toBe('on_time');
  });

  test('late: covered only with a claim after dueAt (grace payments are late)', () => {
    expect(
      freezeObligationStatus(
        [
          { state: 'confirmed', amount: 5000, claimedAt: ON_TIME },
          { state: 'confirmed', amount: 5000, claimedAt: LATE },
        ],
        EXPECTED,
        DUE_AT
      )
    ).toBe('late');
    expect(
      freezeObligationStatus([{ state: 'claimed', amount: 10_000, claimedAt: LATE }], EXPECTED, DUE_AT)
    ).toBe('late');
  });

  test('an extra late top-up never downgrades a member already covered on time', () => {
    expect(
      freezeObligationStatus(
        [
          { state: 'confirmed', amount: 10_000, claimedAt: ON_TIME },
          { state: 'confirmed', amount: 1000, claimedAt: LATE }, // overpay after dueAt
        ],
        EXPECTED,
        DUE_AT
      )
    ).toBe('on_time');
  });

  test('partial: claimed sum > 0 but short; the untouched shortfall pending changes nothing', () => {
    expect(
      freezeObligationStatus(
        [
          { state: 'confirmed', amount: 5000, claimedAt: ON_TIME },
          { state: 'pending', amount: 5000 }, // the shortfall split record, never claimed
        ],
        EXPECTED,
        DUE_AT
      )
    ).toBe('partial');
  });

  test('unpaid: zero claimed — untouched pending and cancelled records count for nothing', () => {
    expect(freezeObligationStatus([{ state: 'pending', amount: 10_000 }], EXPECTED, DUE_AT)).toBe(
      'unpaid'
    );
    expect(
      freezeObligationStatus(
        [{ state: 'cancelled', amount: 10_000, claimedAt: ON_TIME }],
        EXPECTED,
        DUE_AT
      )
    ).toBe('unpaid');
    expect(freezeObligationStatus([], EXPECTED, DUE_AT)).toBe('unpaid');
  });

  test('disputed: any record in dispute at close wins over everything else', () => {
    expect(
      freezeObligationStatus(
        [
          { state: 'confirmed', amount: 10_000, claimedAt: ON_TIME },
          { state: 'disputed', amount: 5000, claimedAt: ON_TIME },
        ],
        EXPECTED,
        DUE_AT
      )
    ).toBe('disputed');
  });

  test('2-member group: the lone contributor in beneficiaryContributes=false mode', () => {
    // direct mode, m_b pays m_a directly and on time — expected is one share.
    expect(
      freezeObligationStatus(
        [{ state: 'confirmed', amount: 5000, claimedAt: ON_TIME }],
        5000,
        DUE_AT
      )
    ).toBe('on_time');
  });
});
