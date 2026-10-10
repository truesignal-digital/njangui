import { describe, expect, test } from 'bun:test';

import { choiceCardIconColor } from './choice-card';

const theme = { text: 'text', accent: 'accent', successDark: 'successDark' };

describe('choiceCardIconColor', () => {
  test('dominant card uses text on its light chip', () => {
    expect(choiceCardIconColor({ dominant: true, selected: false }, theme)).toBe('text');
  });

  test('dominant wins over selected', () => {
    expect(choiceCardIconColor({ dominant: true, selected: true }, theme)).toBe('text');
  });

  test('selected card uses accent', () => {
    expect(choiceCardIconColor({ dominant: false, selected: true }, theme)).toBe('accent');
  });

  test('default card uses successDark', () => {
    expect(choiceCardIconColor({ dominant: false, selected: false }, theme)).toBe('successDark');
  });
});
