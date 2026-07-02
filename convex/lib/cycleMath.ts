// ─────────────────────────────────────────────────────────────
// Cycle math — pure helpers shared by the cycle mutations.
//
// NO Convex imports: plain TypeScript so the logic is unit-testable
// (colocated cycleMath.test.ts) and the draft/lock mutations call one
// source of truth. See docs/02-lifecycle-state-machines.md §a.
// ─────────────────────────────────────────────────────────────

/**
 * The 1-based index the NEXT real (active) cycle should take.
 *
 * A `draft` cycle is a work-in-progress rotation order, not a cycle that
 * ever ran — it must NOT count toward the sequential index, or every cycle
 * after the first draft would be mis-numbered (the stranded-draft bug:
 * `cycles.length + 1` counted drafts too). Only `active` / `completed` /
 * `cancelled` cycles are real history.
 */
export function nextCycleIndex(cycles: readonly { status: string }[]): number {
  return cycles.filter((c) => c.status !== 'draft').length + 1;
}

export type RotationValidation = { ok: true } | { ok: false; reason: string };

/**
 * A rotation order is valid iff it lists every active membership AT LEAST
 * once and nothing else (02 §a lock guard + §b « deux mains » : a
 * membership may appear N times — N positions, N beneficiary rounds, N×
 * contribution per round). Shared by `saveDraftOrder` (so a draft is
 * always lockable) and `startCycle` (the authoritative check at lock).
 * Ids are plain strings — no Convex types.
 */
export function validateRotationOrder(
  order: readonly string[],
  activeMemberIds: readonly string[]
): RotationValidation {
  const activeSet = new Set(activeMemberIds);
  for (const id of order) {
    if (!activeSet.has(id)) {
      return {
        ok: false,
        reason: 'Rotation order contains a non-active or foreign membership',
      };
    }
  }
  const positioned = new Set(order);
  for (const id of activeSet) {
    if (!positioned.has(id)) {
      return {
        ok: false,
        reason: 'Rotation order must contain every active member at least once',
      };
    }
  }
  return { ok: true };
}
