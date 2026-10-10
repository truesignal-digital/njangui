import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ICONS } from './icons';

const androidSymbols: Record<string, number> = JSON.parse(
  readFileSync(
    join(import.meta.dir, '..', '..', 'node_modules', 'expo-symbols', 'build', 'android', 'symbols.json'),
    'utf8'
  )
);

describe('ICONS', () => {
  const entries = Object.entries(ICONS);

  test('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test.each(entries)('%s names both platforms', (_name, symbol) => {
    expect(symbol.ios.trim()).not.toBe('');
    expect(symbol.android.trim()).not.toBe('');
  });

  test.each(entries)('%s android name exists in Material Symbols', (_name, symbol) => {
    expect(Object.hasOwn(androidSymbols, symbol.android)).toBe(true);
  });
});
