import { describe, expect, test } from 'bun:test';

import { DEFAULT_THEME_PREFERENCE } from './theme-preference';

describe('theme preference', () => {
  test('a new install opens in light', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('light');
  });
});
