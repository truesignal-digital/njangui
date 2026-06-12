/** Tiny className joiner — no clsx dep needed for NativeWind class lists. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
