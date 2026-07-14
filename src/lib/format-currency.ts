/**
 * Format an XAF amount per the copy guide (docs/03 §F): `10 000 F`.
 * Grouped so amounts read like the paper ledger — with NO-BREAK spaces
 * (U+202F between groups, U+00A0 before F) so « 50 000 F » can never
 * wrap mid-amount in a sentence.
 * Ported from the web app's components/format/currency.ts.
 */
export function formatCurrencyXAF(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped} F`;
}
