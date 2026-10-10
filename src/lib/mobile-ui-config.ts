import rawMobileUiConfig from './mobile-ui-config.json';

type ColorMode = 'light' | 'dark';

type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceRecessed: string;
  text: string;
  textMuted: string;
  textPlaceholder: string;
  textInverted: string;
  textInvertedMuted: string;
  border: string;
  borderFaint: string;
  borderSubtle: string;
  accent: string;
  accentHero: string;
  collectiveHero: string;
  accentHover: string;
  accentFaint: string;
  accentLight: string;
  accentMuted: string;
  accentSoft: string;
  primaryForeground: string;
  highlight: string;
  highlightHover: string;
  highlightForeground: string;
  success: string;
  successDark: string;
  successBg: string;
  successFaint: string;
  warning: string;
  warningDark: string;
  warningBg: string;
  destructive: string;
  destructiveDark: string;
  destructiveBg: string;
  info: string;
  infoDark: string;
  infoBg: string;
  invertedBg: string;
  invertedOverlay: string;
  invertedLight: string;
  scrim: string;
  scrimHeart: string;
  imageOverlay: string;
  overlayLight: string;
  cardShadow: string;
};

type TextTransform = 'none' | 'capitalize' | 'uppercase' | 'lowercase';

type FontFamilyToken = 'system' | 'systemMedium' | 'rounded' | 'mono';
type FontWeightToken = '400' | '500' | '600' | '700';
type FontConfig = { family: FontFamilyToken; weight: FontWeightToken };

type FontsMap = {
  heading: FontConfig;
  headingSemiBold: FontConfig;
  body: FontConfig;
  bodyMedium: FontConfig;
  bodySemiBold: FontConfig;
  bodyBold: FontConfig;
  mono: FontConfig;
  monoBold: FontConfig;
  money: FontConfig;
};

type TypographyConfig = {
  font: keyof FontsMap;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: TextTransform;
};

type TypographyMap = {
  display: TypographyConfig;
  displayLarge: TypographyConfig;
  headline: TypographyConfig;
  titleLarge: TypographyConfig;
  title: TypographyConfig;
  titleSmall: TypographyConfig;
  body: TypographyConfig;
  bodySmall: TypographyConfig;
  label: TypographyConfig;
  caption: TypographyConfig;
  overline: TypographyConfig;
  tabLabel: TypographyConfig;
  moneyHero: TypographyConfig;
  money: TypographyConfig;
  priceLarge: TypographyConfig;
  priceMedium: TypographyConfig;
  priceSmall: TypographyConfig;
  statLarge: TypographyConfig;
  statMedium: TypographyConfig;
  statSmall: TypographyConfig;
};

type ShadowMap = {
  card: { x: number; y: number; blur: number; opacity: number };
  floating: { x: number; y: number; blur: number; opacity: number };
  ctaBar: { x: number; y: number; blur: number; opacity: number };
  heart: { x: number; y: number; blur: number; opacity: number };
  light: { x: number; y: number; blur: number; opacity: number };
};

export type MobileUiConfig = {
  structuralColors: {
    white: string;
    black: string;
  };
  colors: Record<ColorMode, ThemeColors>;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
    cta: number;
    tabBar: number;
  };
  spacingExtras: {
    bottomLg: number;
    bottomXl: number;
    bottomXxl: number;
    tabScreenBottom: number;
  };
  radius: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    pill: number;
    full: number;
  };
  /** Named families per platform; `system` and `null` mean no family (SF Pro / Roboto). */
  fontFamilies: Record<
    Exclude<FontFamilyToken, 'system'>,
    { ios: string | null; android: string | null }
  >;
  fonts: FontsMap;
  typography: TypographyMap;
  shadows: ShadowMap;
  shadowDarkOpacityMultiplier: number;
  dimensions: {
    metricCardMinHeight: number;
    metricCompactMinHeight: number;
    iconSm: number;
    iconMd: number;
    iconLg: number;
    searchBarHeight: number;
    propertyImageHeight: number;
    heroImageHeight: number;
  };
  motion: {
    pressScale: number;
    pressDuration: number;
    enterDuration: number;
    exitDuration: number;
    successDuration: number;
    reducedDuration: number;
  };
  layout: {
    compact: {
      compactRadius: number;
      cardRadius: number;
      sheetRadius: number;
      pillRadius: number;
      rowMinHeight: number;
      controlHeight: number;
      iconBubble: number;
      sectionGap: number;
      footerHeight: number;
    };
  };
};

export type MobileColorMode = ColorMode;
export type MobileThemeColors = ThemeColors;

export const mobileUiConfig = rawMobileUiConfig as MobileUiConfig;
