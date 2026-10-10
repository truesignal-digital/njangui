import { describe, expect, test } from 'bun:test';

import { addMonths, monthGrid } from './month-grid';

const OCTOBER = 9;

describe('monthGrid', () => {
  test('fr starts the week on Monday with French names', () => {
    const grid = monthGrid(2026, OCTOBER, 'fr');

    expect(grid.weekdays.map((d) => d.long)).toEqual([
      'lundi',
      'mardi',
      'mercredi',
      'jeudi',
      'vendredi',
      'samedi',
      'dimanche',
    ]);
    expect(grid.weekdays[0]?.short).toBe('lun.');
    expect(grid.title).toBe('octobre 2026');
  });

  test('en also starts the week on Monday (Cameroon) with English names', () => {
    const grid = monthGrid(2026, OCTOBER, 'en');

    expect(grid.weekdays.map((d) => d.long)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(grid.weekdays[0]?.short).toBe('Mon');
    expect(grid.title).toBe('October 2026');
  });

  test('an unknown locale falls back to fr', () => {
    expect(monthGrid(2026, OCTOBER, 'de-DE')).toEqual(
      monthGrid(2026, OCTOBER, 'fr'),
    );
  });

  test('places 1 October 2026 (a Thursday) in the right column', () => {
    const fr = monthGrid(2026, OCTOBER, 'fr');
    const en = monthGrid(2026, OCTOBER, 'en');

    expect(fr.weeks[0]?.map((cell) => cell?.day ?? null)).toEqual([
      null, null, null, 1, 2, 3, 4,
    ]);
    expect(en.weeks[0]?.map((cell) => cell?.day ?? null)).toEqual([
      null, null, null, 1, 2, 3, 4,
    ]);
  });

  test('every week has 7 cells and every day of the month appears once', () => {
    for (const [year, month, length] of [
      [2026, OCTOBER, 31],
      [2028, 1, 29],
      [2027, 1, 28],
    ] as const) {
      const grid = monthGrid(year, month, 'fr');
      for (const week of grid.weeks) expect(week).toHaveLength(7);
      const days = grid.weeks.flat().filter((cell) => cell !== null);
      expect(days.map((cell) => cell.day)).toEqual(
        Array.from({ length }, (_, i) => i + 1),
      );
    }
  });

  test('each day is a local-midnight date with a localized label', () => {
    const fr = monthGrid(2026, OCTOBER, 'fr');
    const en = monthGrid(2026, OCTOBER, 'en');
    const firstFr = fr.weeks.flat().find((cell) => cell?.day === 1);
    const firstEn = en.weeks.flat().find((cell) => cell?.day === 1);

    expect(firstFr?.date.getTime()).toBe(new Date(2026, OCTOBER, 1).getTime());
    expect(firstFr?.date.getHours()).toBe(0);
    expect(firstFr?.label).toBe('jeudi 1 octobre 2026');
    expect(firstEn?.label).toBe('Thursday, October 1, 2026');
  });
});

describe('addMonths', () => {
  test('wraps across year boundaries', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, OCTOBER, 1)).toEqual({ year: 2026, month: 10 });
  });
});
