import { describe, expect, test } from 'bun:test';

import config from './mobile-ui-config.json';
import { resolveFontStyle, type FontToken } from './fonts';

const tokens = Object.keys(config.fonts) as FontToken[];

describe('resolveFontStyle', () => {
  test('iOS sans text sets only a weight, so it stays SF Pro', () => {
    expect(resolveFontStyle('bodySemiBold', 'ios')).toEqual({ fontWeight: '600' });
    expect(resolveFontStyle('bodyMedium', 'ios')).toEqual({ fontWeight: '500' });
    expect(resolveFontStyle('heading', 'ios')).toEqual({ fontWeight: '700' });
  });

  test('Android 400/700 sans text leaves the family unset (Roboto)', () => {
    expect(resolveFontStyle('body', 'android')).toEqual({ fontWeight: '400' });
    expect(resolveFontStyle('heading', 'android')).toEqual({ fontWeight: '700' });
  });

  test('Android 500/600 sans text uses Roboto Medium', () => {
    expect(resolveFontStyle('bodyMedium', 'android')).toEqual({
      fontFamily: 'sans-serif-medium',
      fontWeight: '500',
    });
    expect(resolveFontStyle('bodySemiBold', 'android')).toEqual({
      fontFamily: 'sans-serif-medium',
      fontWeight: '600',
    });
  });

  test('money is rounded bold on iOS and Roboto bold on Android', () => {
    expect(resolveFontStyle('money', 'ios')).toEqual({ fontFamily: 'ui-rounded', fontWeight: '700' });
    expect(resolveFontStyle('money', 'android')).toEqual({ fontFamily: 'sans-serif', fontWeight: '700' });
  });

  test('codes use the platform monospace', () => {
    expect(resolveFontStyle('mono', 'ios').fontFamily).toBe('ui-monospace');
    expect(resolveFontStyle('mono', 'android').fontFamily).toBe('monospace');
  });

  // React Native Android picks the face from Typeface NORMAL | BOLD (weight
  // >= 700) for any named family, and for an unset family below API 28
  // (ReactFontManager.kt TypefaceStyle.nearestStyle / apply). So 500/600 must
  // name the Roboto Medium face, or they render Regular on Android 7/8.
  test('every Android 500/600 sans token names sans-serif-medium', () => {
    for (const token of tokens) {
      const style = resolveFontStyle(token, 'android');
      if (style.fontFamily !== 'monospace' && ['500', '600'].includes(style.fontWeight)) {
        expect([token, style.fontFamily]).toEqual([token, 'sans-serif-medium']);
      }
    }
  });

  test('no token names a Google font', () => {
    for (const token of tokens) {
      for (const os of ['ios', 'android'] as const) {
        expect(resolveFontStyle(token, os).fontFamily ?? '').not.toMatch(/_\d{3}/);
      }
    }
  });
});
