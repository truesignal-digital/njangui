import config from './mobile-ui-config.json';

export type FontToken = keyof typeof config.fonts;
type FontWeight = '400' | '500' | '600' | '700';
export type FontStyle = { fontFamily?: string; fontWeight: FontWeight };

/**
 * JS-track twin of the `font-*` classes in tailwind.config.ts. Family
 * `system` leaves fontFamily unset: that is SF Pro on iOS and Roboto on
 * Android, and on Android only an unset family renders real 500/600 weights.
 */
export function resolveFontStyle(token: FontToken, os: string): FontStyle {
  const { family, weight } = config.fonts[token];
  const fontWeight = weight as FontWeight;
  if (family === 'system') return { fontWeight };
  const families = config.fontFamilies[family as keyof typeof config.fontFamilies];
  return { fontFamily: os === 'ios' ? families.ios : families.android, fontWeight };
}
