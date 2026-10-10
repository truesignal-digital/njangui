import { describe, expect, test } from 'bun:test';
import { changesBehaviour, evidenceProblems, section } from './pr-evidence';

const APP = ['app/(app)/(tabs)/index.tsx'];

describe('changesBehaviour', () => {
  test('app, src and convex code count; tests, generated code and docs do not', () => {
    expect(changesBehaviour(['src/components/ui/button.tsx'])).toBe(true);
    expect(changesBehaviour(['convex/paymentRecords.ts'])).toBe(true);
    expect(changesBehaviour(['src/i18n/locales/en.json'])).toBe(true);
    expect(changesBehaviour(['app.json'])).toBe(true);
    expect(changesBehaviour(['convex/paymentRecords.integration.test.ts', 'convex/lib/roundMath.test.ts'])).toBe(false);
    expect(changesBehaviour(['convex/_generated/api.d.ts', 'docs/x.md', 'scripts/tiers.ts', '.github/workflows/ci.yml'])).toBe(false);
  });
});

describe('evidenceProblems', () => {
  test('a docs-only PR needs nothing', () => {
    expect(evidenceProblems('', ['docs/plan.md'])).toEqual([]);
  });

  test('an app PR without a video or findings fails twice', () => {
    const body = '## What changed\n\nStuff.\n\n## Walkthrough video\n\n<!-- link here -->\n';
    expect(evidenceProblems(body, APP)).toHaveLength(2);
  });

  test('a reel link and "none" pass', () => {
    const body = '## Walkthrough video\n\n[📼 reel](https://files.truesignaldigital.com/reel-ab12cd.mp4)\n\n## Found while testing\n\nnone\n';
    expect(evidenceProblems(body, APP)).toEqual([]);
  });

  test('a link that is not a video does not count', () => {
    const body = '## Walkthrough video\n\nhttps://github.com/x/y/pull/1\n\n## Found while testing\n\nnone\n';
    expect(evidenceProblems(body, APP)).toHaveLength(1);
  });

  test('"not recorded" needs a reason', () => {
    const ok = '## Walkthrough video\n\nWalkthrough video: not recorded (Convex-only change, no screen reads it)\n\nFound while testing: none\n';
    const bare = '## Walkthrough video\n\nnot recorded\n\nFound while testing: none\n';
    expect(evidenceProblems(ok, APP)).toEqual([]);
    expect(evidenceProblems(bare, APP)).toHaveLength(1);
  });

  test("the template's older `## Walkthrough` heading still counts", () => {
    const body = '## Walkthrough\n\nhttps://files.truesignaldigital.com/a.mp4\n\n## Found while testing\n\nnone\n';
    expect(evidenceProblems(body, APP)).toEqual([]);
  });

  test('HTML comments never satisfy a section', () => {
    const body = '## Walkthrough video\n\n<!-- https://files.truesignaldigital.com/a.mp4 -->\n\n## Found while testing\n\n<!-- none -->\n';
    expect(evidenceProblems(body, APP)).toHaveLength(2);
    expect(section(body, 'Found while testing')).toBe('');
  });
});
