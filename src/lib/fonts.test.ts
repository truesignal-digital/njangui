import { describe, expect, test } from 'bun:test';

import config from './mobile-ui-config.json';
import { resolveFontStyle, type FontToken } from './fonts';

const tokens = Object.keys(config.fonts) as FontToken[];

describe('resolveFontStyle', () => {
  test('sans text sets only a weight, so both platforms use the system font', () => {
    expect(resolveFontStyle('bodySemiBold', 'ios')).toEqual({ fontWeight: '600' });
    expect(resolveFontStyle('bodySemiBold', 'android')).toEqual({ fontWeight: '600' });
    expect(resolveFontStyle('heading', 'android')).toEqual({ fontWeight: '700' });
  });

  test('money is rounded bold on iOS and Roboto bold on Android', () => {
    expect(resolveFontStyle('money', 'ios')).toEqual({ fontFamily: 'ui-rounded', fontWeight: '700' });
    expect(resolveFontStyle('money', 'android')).toEqual({ fontFamily: 'sans-serif', fontWeight: '700' });
  });

  test('codes use the platform monospace', () => {
    expect(resolveFontStyle('mono', 'ios').fontFamily).toBe('ui-monospace');
    expect(resolveFontStyle('mono', 'android').fontFamily).toBe('monospace');
  });

  // React Native Android maps a named fontFamily to Typeface.create(name,
  // NORMAL | BOLD), so 500/600 would render as regular. Only an unset family
  // gets real intermediate weights.
  test('no Android token pairs a named family with a 500 or 600 weight', () => {
    for (const token of tokens) {
      const style = resolveFontStyle(token, 'android');
      if (style.fontFamily && style.fontFamily !== 'monospace') {
        expect([token, style.fontWeight]).toEqual([token, '700']);
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
