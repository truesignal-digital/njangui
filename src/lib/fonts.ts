import config from './mobile-ui-config.json';

export type FontToken = keyof typeof config.fonts;
type FontWeight = '400' | '500' | '600' | '700';
export type FontStyle = { fontFamily?: string; fontWeight: FontWeight };

/**
 * JS-track twin of the `font-*` classes in tailwind.config.ts. Family
 * `system` (or a null platform entry) leaves fontFamily unset: SF Pro on iOS,
 * Roboto on Android. React Native Android only distinguishes Regular from
 * Bold (>= 700) when picking a face below API 28 and for any named family,
 * so Android 500/600 name the Roboto Medium face (`systemMedium`).
 */
export function resolveFontStyle(token: FontToken, os: string): FontStyle {
  const { family, weight } = config.fonts[token];
  const fontWeight = weight as FontWeight;
  if (family === 'system') return { fontWeight };
  const families = config.fontFamilies[family as keyof typeof config.fontFamilies];
  const fontFamily = os === 'ios' ? families.ios : families.android;
  return fontFamily ? { fontFamily, fontWeight } : { fontWeight };
}
