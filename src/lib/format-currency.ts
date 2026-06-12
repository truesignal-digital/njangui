/**
 * Format an XAF amount per the copy guide (docs/03 §F): `10 000 F`.
 * Grouped with spaces so amounts read like the paper ledger.
 * Ported from the web app's components/format/currency.ts.
 */
export function formatCurrencyXAF(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped} F`;
}
