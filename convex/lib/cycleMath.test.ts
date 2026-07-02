import { describe, expect, test } from 'bun:test';

import { nextCycleIndex, validateRotationOrder } from './cycleMath';

// ── nextCycleIndex — drafts never count ──────────────────────

describe('nextCycleIndex', () => {
  test('no cycles → 1', () => {
    expect(nextCycleIndex([])).toBe(1);
  });

  test('counts active/completed/cancelled, never draft', () => {
    expect(nextCycleIndex([{ status: 'completed' }])).toBe(2);
    expect(
      nextCycleIndex([{ status: 'completed' }, { status: 'cancelled' }])
    ).toBe(3);
  });

  test('a stranded draft does NOT advance the index (the bug this fixes)', () => {
    // One completed cycle + a draft being arranged → the next real cycle is #2,
    // not #3. `cycles.length + 1` would have mis-numbered it.
    expect(nextCycleIndex([{ status: 'completed' }, { status: 'draft' }])).toBe(
      2
    );
    // First cycle ever, with a draft present → still #1.
    expect(nextCycleIndex([{ status: 'draft' }])).toBe(1);
  });

  test('multiple drafts (defensive) still collapse to the real count', () => {
    expect(
      nextCycleIndex([
        { status: 'draft' },
        { status: 'draft' },
        { status: 'active' },
      ])
    ).toBe(2);
  });
});

// ── validateRotationOrder — at least once over active members
//    (02 §b « deux mains » : repeats = multiple hands) ──

describe('validateRotationOrder', () => {
  const active = ['a', 'b', 'c'];

  test('every active member exactly once → ok', () => {
    expect(validateRotationOrder(['c', 'a', 'b'], active)).toEqual({
      ok: true,
    });
  });

  test('missing a member → rejected', () => {
    const r = validateRotationOrder(['a', 'b'], active);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('at least once');
  });

  test('deux mains — a repeated member → ok', () => {
    expect(validateRotationOrder(['a', 'b', 'c', 'a'], active)).toEqual({
      ok: true,
    });
  });

  test('three hands, interleaved positions → ok', () => {
    expect(validateRotationOrder(['a', 'b', 'a', 'c', 'a'], active)).toEqual({
      ok: true,
    });
  });

  test('a foreign / non-active id → rejected with the foreign message', () => {
    const r = validateRotationOrder(['a', 'b', 'x'], active);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('non-active or foreign');
  });

  test('duplicate hands never excuse a missing member', () => {
    // 'a' twice but 'c' absent — matching activeSet.size is not enough.
    const r = validateRotationOrder(['a', 'a', 'b'], active);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('at least once');
  });

  test('empty group order → ok only when no active members', () => {
    expect(validateRotationOrder([], [])).toEqual({ ok: true });
    expect(validateRotationOrder([], active).ok).toBe(false);
  });
});
