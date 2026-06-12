import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

import { mobileUiConfig, type MobileThemeColors } from './mobile-ui-config';

export type TypographyToken = keyof typeof mobileUiConfig.typography;
export type ShadowToken = keyof typeof mobileUiConfig.shadows;

export type AppTheme = MobileThemeColors & {
  mode: 'light' | 'dark';
  isDark: boolean;
  fonts: typeof mobileUiConfig.fonts;
  spacing: typeof mobileUiConfig.spacing;
  radius: typeof mobileUiConfig.radius;
  shadow: (token: ShadowToken) => ViewStyle;
  textStyle: (token: TypographyToken, color?: string) => TextStyle;
};

function buildShadow(mode: 'light' | 'dark', token: ShadowToken): ViewStyle {
  const shadow = mobileUiConfig.shadows[token] ?? mobileUiConfig.shadows.card;
  const opacity =
    mode === 'dark'
      ? shadow.opacity * mobileUiConfig.shadowDarkOpacityMultiplier
      : shadow.opacity;
  return {
    boxShadow: `${shadow.x}px ${shadow.y}px ${shadow.blur}px rgba(0, 0, 0, ${opacity.toFixed(3)})`,
  };
}

export function getAppTheme(mode: 'light' | 'dark'): AppTheme {
  const palette = mobileUiConfig.colors[mode];
  return {
    mode,
    isDark: mode === 'dark',
    ...palette,
    fonts: mobileUiConfig.fonts,
    spacing: mobileUiConfig.spacing,
    radius: mobileUiConfig.radius,
    shadow(token) {
      return buildShadow(mode, token);
    },
    textStyle(token, color = palette.text) {
      return {
        ...(mobileUiConfig.typography[token] as TextStyle),
        color,
      };
    },
  };
}

export function useAppTheme(): AppTheme {
  const scheme = useColorScheme();
  return getAppTheme(scheme === 'dark' ? 'dark' : 'light');
}

/* ─── Standalone exports for NativeWind components ─── */

/** Platform-specific shadow styles — use via `style` prop alongside NativeWind className */
export function getShadow(token: ShadowToken, mode: 'light' | 'dark' = 'light'): ViewStyle {
  return buildShadow(mode, token);
}

/** Hook that returns only shadow helper — lightweight alternative to full useAppTheme */
export function useShadow() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return (token: ShadowToken) => getShadow(token, mode);
}

/** Font families for expo-font loading — re-exported for convenience */
export const FONT_FAMILIES = mobileUiConfig.fonts;
