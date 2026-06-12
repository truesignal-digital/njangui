const mobileUiConfig = require('./src/lib/mobile-ui-config.json');

const colorVars = {
  background: '--color-background',
  surface: '--color-surface',
  surfaceMuted: '--color-surface-muted',
  surfaceRecessed: '--color-surface-recessed',
  text: '--color-text',
  textMuted: '--color-text-muted',
  textPlaceholder: '--color-text-placeholder',
  textInverted: '--color-text-inverted',
  textInvertedMuted: '--color-text-inverted-muted',
  border: '--color-border',
  borderFaint: '--color-border-faint',
  borderSubtle: '--color-border-subtle',
  accent: '--color-accent',
  accentHover: '--color-accent-hover',
  accentFaint: '--color-accent-faint',
  accentLight: '--color-accent-light',
  accentMuted: '--color-accent-muted',
  accentSoft: '--color-accent-soft',
  primaryForeground: '--color-primary-fg',
  success: '--color-success',
  successDark: '--color-success-dark',
  successBg: '--color-success-bg',
  successFaint: '--color-success-faint',
  warning: '--color-warning',
  warningDark: '--color-warning-dark',
  warningBg: '--color-warning-bg',
  destructive: '--color-destructive',
  destructiveDark: '--color-destructive-dark',
  destructiveBg: '--color-destructive-bg',
  info: '--color-info',
  infoDark: '--color-info-dark',
  infoBg: '--color-info-bg',
  invertedBg: '--color-inverted-bg',
  invertedOverlay: '--color-inverted-overlay',
  invertedLight: '--color-inverted-light',
  scrim: '--color-scrim',
  scrimHeart: '--color-scrim-heart',
  imageOverlay: '--color-image-overlay',
  overlayLight: '--color-overlay-light',
  cardShadow: '--color-card-shadow',
} as const;

function px(value: number) {
  return `${value}px`;
}

function cssVar(token: keyof typeof colorVars) {
  return `var(${colorVars[token]})`;
}

function tokenVars(mode: 'light' | 'dark') {
  const palette = mobileUiConfig.colors[mode];
  return Object.fromEntries(
    Object.entries(colorVars).map(([token, variable]) => [
      variable,
      toCssColor(palette[token as keyof typeof palette] as string),
    ])
  );
}

function toCssColor(value: string) {
  if (!/^#[0-9a-fA-F]{8}$/.test(value)) return value;
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  const a = Number.parseInt(value.slice(7, 9), 16) / 255;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function shadow(token: keyof typeof mobileUiConfig.shadows) {
  const value = mobileUiConfig.shadows[token];
  return `${value.x}px ${value.y}px ${value.blur}px rgba(0, 0, 0, ${value.opacity})`;
}

function fontSize(token: keyof typeof mobileUiConfig.typography) {
  const value = mobileUiConfig.typography[token];
  const options: Record<string, string> = {};
  if (value.lineHeight !== undefined) options.lineHeight = px(value.lineHeight);
  if (value.letterSpacing !== undefined) options.letterSpacing = px(value.letterSpacing);
  return [px(value.fontSize), options];
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    /* ─── OVERRIDE DEFAULTS ─── enforce design system only ─── */
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: mobileUiConfig.structuralColors.white,
      black: mobileUiConfig.structuralColors.black,

      /* Surfaces */
      background: cssVar('background'),
      surface: cssVar('surface'),
      'surface-muted': cssVar('surfaceMuted'),
      'surface-recessed': cssVar('surfaceRecessed'),

      /* Text */
      foreground: cssVar('text'),
      muted: cssVar('textMuted'),
      placeholder: cssVar('textPlaceholder'),
      inverted: cssVar('textInverted'),
      'inverted-muted': cssVar('textInvertedMuted'),

      /* Borders */
      border: cssVar('border'),
      'border-faint': cssVar('borderFaint'),
      'border-subtle': cssVar('borderSubtle'),

      /* Brand Accent */
      accent: cssVar('accent'),
      'accent-hover': cssVar('accentHover'),
      'accent-faint': cssVar('accentFaint'),
      'accent-light': cssVar('accentLight'),
      'accent-muted': cssVar('accentMuted'),
      'accent-soft': cssVar('accentSoft'),
      'primary-fg': cssVar('primaryForeground'),

      /* Status */
      success: cssVar('success'),
      'success-dark': cssVar('successDark'),
      'success-bg': cssVar('successBg'),
      'success-faint': cssVar('successFaint'),
      warning: cssVar('warning'),
      'warning-dark': cssVar('warningDark'),
      'warning-bg': cssVar('warningBg'),
      destructive: cssVar('destructive'),
      'destructive-dark': cssVar('destructiveDark'),
      'destructive-bg': cssVar('destructiveBg'),
      info: cssVar('info'),
      'info-dark': cssVar('infoDark'),
      'info-bg': cssVar('infoBg'),

      /* Overlays / Scrims */
      'inverted-bg': cssVar('invertedBg'),
      'inverted-overlay': cssVar('invertedOverlay'),
      'inverted-light': cssVar('invertedLight'),
      scrim: cssVar('scrim'),
      'scrim-heart': cssVar('scrimHeart'),
      'image-overlay': cssVar('imageOverlay'),
      'overlay-light': cssVar('overlayLight'),
      'card-shadow': cssVar('cardShadow'),
    },

    spacing: {
      0: '0px',
      px: '1px',
      0.5: '2px',
      1: '4px',
      1.5: '6px',
      2: px(mobileUiConfig.spacing.xs),
      xs: px(mobileUiConfig.spacing.xs),
      3: px(mobileUiConfig.spacing.sm),
      sm: px(mobileUiConfig.spacing.sm),
      4: px(mobileUiConfig.spacing.md),
      md: px(mobileUiConfig.spacing.md),
      5: px(mobileUiConfig.spacing.lg),
      lg: px(mobileUiConfig.spacing.lg),
      6: px(mobileUiConfig.spacing.xl),
      xl: px(mobileUiConfig.spacing.xl),
      8: px(mobileUiConfig.spacing.xxl),
      '2xl': px(mobileUiConfig.spacing.xxl),
      10: px(mobileUiConfig.spacing.xxxl),
      '3xl': px(mobileUiConfig.spacing.xxxl),
      13: px(mobileUiConfig.spacing.cta),
      cta: px(mobileUiConfig.spacing.cta),
      16: px(mobileUiConfig.spacing.tabBar),
      'tab-bar': px(mobileUiConfig.spacing.tabBar),
      /* Extra utilities for padding-bottom etc. */
      20: px(mobileUiConfig.spacingExtras.bottomLg),
      24: px(mobileUiConfig.spacingExtras.bottomXl),
      32: px(mobileUiConfig.spacingExtras.bottomXxl),
      33: px(mobileUiConfig.spacingExtras.tabScreenBottom),
    },

    borderRadius: {
      none: '0px',
      xs: px(mobileUiConfig.radius.xs),
      sm: px(mobileUiConfig.radius.sm),
      md: px(mobileUiConfig.radius.md),
      lg: px(mobileUiConfig.radius.lg),
      xl: px(mobileUiConfig.radius.xl),
      '2xl': px(mobileUiConfig.radius.xxl),
      pill: px(mobileUiConfig.radius.pill),
      full: px(mobileUiConfig.radius.full),
    },

    fontFamily: {
      heading: [mobileUiConfig.fonts.heading],
      'heading-semi': [mobileUiConfig.fonts.headingSemiBold],
      body: [mobileUiConfig.fonts.body],
      'body-medium': [mobileUiConfig.fonts.bodyMedium],
      'body-semi': [mobileUiConfig.fonts.bodySemiBold],
      'body-bold': [mobileUiConfig.fonts.bodyBold],
      mono: [mobileUiConfig.fonts.mono],
      'mono-bold': [mobileUiConfig.fonts.monoBold],
    },

    fontSize: {
      display: fontSize('display'),
      'display-lg': fontSize('displayLarge'),
      headline: fontSize('headline'),
      'title-lg': fontSize('titleLarge'),
      title: fontSize('title'),
      'title-sm': fontSize('titleSmall'),
      body: fontSize('body'),
      'body-sm': fontSize('bodySmall'),
      label: fontSize('label'),
      caption: fontSize('caption'),
      overline: fontSize('overline'),
      'tab-label': fontSize('tabLabel'),
      'price-lg': fontSize('priceLarge'),
      'price-md': fontSize('priceMedium'),
      'price-sm': fontSize('priceSmall'),
      'stat-lg': [px(mobileUiConfig.typography.statLarge.fontSize), { lineHeight: '44px' }],
      'stat-md': [px(mobileUiConfig.typography.statMedium.fontSize), { lineHeight: '30px' }],
      'stat-sm': [px(mobileUiConfig.typography.statSmall.fontSize), { lineHeight: '24px' }],
    },

    extend: {
      /* Shadows — kept in extend so Tailwind base shadows remain available */
      boxShadow: {
        card: shadow('card'),
        floating: shadow('floating'),
        cta: shadow('ctaBar'),
        heart: shadow('heart'),
        light: shadow('light'),
      },
      /* Component-level dimension tokens */
      minHeight: {
        cta: px(mobileUiConfig.spacing.cta),
        'tab-bar': px(mobileUiConfig.spacing.tabBar),
        'metric-card': px(mobileUiConfig.dimensions.metricCardMinHeight),
        'metric-compact': px(mobileUiConfig.dimensions.metricCompactMinHeight),
      },
      width: {
        'icon-sm': px(mobileUiConfig.dimensions.iconSm),
        'icon-md': px(mobileUiConfig.dimensions.iconMd),
      },
      height: {
        'icon-sm': px(mobileUiConfig.dimensions.iconSm),
        'icon-md': px(mobileUiConfig.dimensions.iconMd),
        'search-bar': px(mobileUiConfig.dimensions.searchBarHeight),
        'property-image': px(mobileUiConfig.dimensions.propertyImageHeight),
        'hero-image': px(mobileUiConfig.dimensions.heroImageHeight),
      },
      aspectRatio: {
        '3/4': '3 / 4',
      },
    },
  },
  plugins: [
    /* ─── CSS Variables for Light/Dark ─── */
    function ({ addBase }: { addBase: (styles: Record<string, any>) => void }) {
      addBase({
        ':root': tokenVars('light'),
        '@media (prefers-color-scheme: dark)': {
          ':root': tokenVars('dark'),
        },
      });
    },
  ],
};
