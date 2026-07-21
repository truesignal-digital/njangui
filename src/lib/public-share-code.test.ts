import { describe, expect, it } from 'bun:test';

import { getPublicShareCodeCandidate } from './public-share-code';

describe('getPublicShareCodeCandidate', () => {
  it('accepts URL-safe high-entropy candidates without changing them', () => {
    const code = 'abcDEF0123456789_-wxyz';

    expect(getPublicShareCodeCandidate(code)).toBe(code);
  });

  it('rejects short, ambiguous, or non-string route input', () => {
    expect(getPublicShareCodeCandidate('too-short')).toBeNull();
    expect(getPublicShareCodeCandidate('valid-looking-code-with-!')).toBeNull();
    expect(getPublicShareCodeCandidate(['one', 'two'])).toBeNull();
    expect(getPublicShareCodeCandidate(undefined)).toBeNull();
  });
});
