/**
 * Pure schedule projection — shared by the setup readiness card (client
 * copy) and the calendar query. Estimates only; real dates are frozen on
 * the rounds at lock and NEVER recomputed from these helpers.
 */

export type Schedule = 'weekly' | 'biweekly' | 'monthly';

export function addPeriods(
  start: Date,
  schedule: Schedule,
  periods: number
): Date {
  const d = new Date(start);
  if (schedule === 'monthly') {
    d.setMonth(d.getMonth() + periods);
  } else {
    d.setDate(d.getDate() + periods * (schedule === 'weekly' ? 7 : 14));
  }
  return d;
}

/** Next occurrence of the meeting weekday, at least a few days out. */
export function estimatedFirstRound(
  now: Date,
  meetingDayOfWeek: number | undefined
): Date {
  const d = new Date(now);
  if (meetingDayOfWeek === undefined) {
    d.setDate(d.getDate() + 7);
    return d;
  }
  const delta = (meetingDayOfWeek - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}
