import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PICTOGRAM_NAMES } from './pictograms';

const PICTOGRAM_DIR = join(import.meta.dir, '..', 'components', 'pictograms');

function artFile(name: string): string {
  return join(PICTOGRAM_DIR, `${name}.tsx`);
}

describe('pictogram set', () => {
  test('names are unique', () => {
    expect(new Set(PICTOGRAM_NAMES).size).toBe(PICTOGRAM_NAMES.length);
  });

  test.each([...PICTOGRAM_NAMES])('%s has a component file', (name) => {
    expect(existsSync(artFile(name))).toBe(true);
  });

  test('every component file belongs to a listed name', () => {
    const listed = new Set<string>(PICTOGRAM_NAMES);
    const files = readdirSync(PICTOGRAM_DIR)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => file.replace(/\.tsx$/, ''));
    expect(files.filter((file) => !listed.has(file))).toEqual([]);
  });

  test.each([...PICTOGRAM_NAMES])('%s is one colour and takes it as a prop', (name) => {
    const source = readFileSync(artFile(name), 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    expect(source.match(/\bfill\b/g) ?? []).toHaveLength(1);
    expect(source).toContain('fill={color}');
    expect(source.match(/<Path\b/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/\bstroke\b/);
  });
});
