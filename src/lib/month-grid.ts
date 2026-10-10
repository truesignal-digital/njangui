import { parseAppLocale, toIntlLocale, type AppLocale } from './app-locale';

export type MonthGridDay = {
  day: number;
  /** Local midnight of this day. */
  date: Date;
  /** Full localized date, used as the cell's accessibility label. */
  label: string;
};

export type MonthGrid = {
  title: string;
  /** Seven entries in the locale's week order. */
  weekdays: { short: string; long: string }[];
  /** Rows of seven cells; null pads the days outside the month. */
  weeks: (MonthGridDay | null)[][];
};

/** 0 = Sunday. Hermes has no Intl.Locale week info, so the app locales are mapped by hand. */
// Cameroon starts the week on Monday in both languages.
const firstDayOfWeek: Record<AppLocale, number> = { fr: 1, en: 1 };

// 4 October 2026 is a Sunday; adding 0..6 walks one full week.
const referenceSunday = { year: 2026, month: 9, day: 4 };

export function monthGrid(
  year: number,
  month: number,
  locale: string,
): MonthGrid {
  const appLocale = parseAppLocale(locale);
  const intl = toIntlLocale(appLocale);
  const firstDay = firstDayOfWeek[appLocale];

  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      referenceSunday.year,
      referenceSunday.month,
      referenceSunday.day + ((firstDay + index) % 7),
    );
    return {
      short: date.toLocaleDateString(intl, { weekday: 'short' }),
      long: date.toLocaleDateString(intl, { weekday: 'long' }),
    };
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
  const cells: (MonthGridDay | null)[] = Array.from(
    { length: leading },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      day,
      date,
      label: date.toLocaleDateString(intl, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (MonthGridDay | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }

  return {
    title: new Date(year, month, 1).toLocaleDateString(intl, {
      month: 'long',
      year: 'numeric',
    }),
    weekdays,
    weeks,
  };
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
