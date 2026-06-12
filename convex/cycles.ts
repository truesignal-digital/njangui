import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { computeRoundTimes, dayOfWeekOf, parseIsoDate } from './lib/roundMath';
import { MEMBERSHIP_CAP } from './memberships';
import { completeCycleIfFinished } from './rounds';
import {
  collectionModeValidator,
  cycleStatusValidator,
  orderChangeKindValidator,
  roundStatusValidator,
  scheduleValidator,
} from './schema';
import { logActivityEvent } from './utils/activity';
import {
  getCurrentUserOrNull,
  requireMembership,
  requireRole,
} from './utils/auth';

// ============================================================================
// Reusable return type validators
// ============================================================================

const startCycleResultValidator = v.object({
  cycleId: v.id('cycles'),
  roundCount: v.number(),
});

const rotationRoundValidator = v.object({
  roundId: v.id('rounds'),
  index: v.number(),
  status: roundStatusValidator,
  beneficiaryMembershipId: v.id('memberships'),
  beneficiaryName: v.string(),
  scheduledOpenAt: v.number(),
  dueAt: v.number(),
  graceEndAt: v.number(),
});

const activeCycleValidator = v.object({
  cycleId: v.id('cycles'),
  index: v.number(),
  status: cycleStatusValidator,
  contributionAmount: v.number(),
  schedule: scheduleValidator,
  collectionMode: collectionModeValidator,
  beneficiaryContributes: v.boolean(),
  graceDays: v.number(),
  startDate: v.string(),
  lockedAt: v.optional(v.number()),
  currentRoundId: v.union(v.id('rounds'), v.null()),
  rounds: v.array(rotationRoundValidator),
});

const orderChangeResultValidator = v.object({
  orderChangeId: v.id('orderChanges'),
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Cycle start = LOCK (02 §a). President-only — the lock is the
 * trust-establishing act, and the lock sheet attributes the fixed order
 * to the president by name (03 §B2); "the creator administers during
 * setup" does not include the lock. Guards: group
 * `setup`/`between_cycles`, 2 ≤ active members ≤ 40, order covers every
 * active member EXACTLY ONCE (multi-hand is deferred post-MVP per 01 §5 —
 * 02 §a's "at least once" applies only when multiple hands ship), amount
 * > 0, schedule set, treasurer + president assigned, ≤ 1 active cycle
 * (I-7). On lock the system materializes the whole cycle: snapshots
 * contributionAmount / schedule / beneficiaryContributes / collectionMode /
 * graceDays onto the cycle, and bulk-generates one round per rotation
 * position with scheduledOpenAt / dueAt / graceEndAt from the schedule +
 * meeting day/time (02 §b, convex/lib/roundMath.ts). The order becomes
 * immutable and public; post-lock changes only via recordOrderChange.
 */
export const startCycle = mutation({
  args: {
    groupId: v.id('groups'),
    rotationOrder: v.array(v.id('memberships')),
    startDate: v.string(), // YYYY-MM-DD — round 1's réunion date (cycles.startDate)
  },
  returns: startCycleResultValidator,
  handler: async (ctx, args) => {
    const { membership: actor } = await requireRole(ctx, args.groupId, [
      'president',
    ]);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    if (group.status !== 'setup' && group.status !== 'between_cycles') {
      throw new Error('A cycle can only start from setup or between_cycles');
    }
    if (
      !Number.isInteger(group.contributionAmount) ||
      group.contributionAmount <= 0
    ) {
      throw new Error(
        'Contribution amount must be a positive whole number of XAF'
      );
    }
    if (group.schedule !== 'monthly' && group.meetingDayOfWeek === undefined) {
      throw new Error(
        'Meeting day of week is required for weekly and biweekly schedules'
      );
    }

    // I-7: at most one active cycle per group.
    const activeCycle = await ctx.db
      .query('cycles')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', args.groupId).eq('status', 'active')
      )
      .first();
    if (activeCycle) {
      throw new Error('A cycle is already active in this group');
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    const activeMembers = memberships.filter((m) => m.status === 'active');

    if (activeMembers.length < 2) {
      throw new Error('A cycle needs at least 2 active members');
    }
    if (activeMembers.length > MEMBERSHIP_CAP) {
      throw new Error(`Group is over the ${MEMBERSHIP_CAP}-membership cap`);
    }
    if (!activeMembers.some((m) => m.role === 'treasurer')) {
      throw new Error(
        'A treasurer must be assigned before the cycle can start'
      );
    }
    if (!activeMembers.some((m) => m.role === 'president')) {
      throw new Error(
        'A president must be assigned before the cycle can start'
      );
    }

    // Order covers every active member exactly once.
    const activeIds = new Set(activeMembers.map((m) => m._id));
    if (args.rotationOrder.length !== activeIds.size) {
      throw new Error(
        'Rotation order must contain every active member exactly once'
      );
    }
    const seen = new Set<Id<'memberships'>>();
    for (const membershipId of args.rotationOrder) {
      if (!activeIds.has(membershipId)) {
        throw new Error(
          'Rotation order contains a non-active or foreign membership'
        );
      }
      if (seen.has(membershipId)) {
        throw new Error(
          'Rotation order must contain every active member exactly once'
        );
      }
      seen.add(membershipId);
    }

    // startDate must be a real date and fall on the meeting day for
    // weekly/biweekly schedules — every later réunion derives from it.
    const startParts = parseIsoDate(args.startDate);
    if (
      group.schedule !== 'monthly' &&
      group.meetingDayOfWeek !== undefined &&
      dayOfWeekOf(startParts) !== group.meetingDayOfWeek
    ) {
      throw new Error('Start date must fall on the group meeting day');
    }

    // A backdated start would let the cron blast round 1 (and possibly later
    // rounds) straight through open → grace → closed before anyone can claim,
    // freezing every member `unpaid`. Onboarding a group mid-rotation needs
    // an explicit import flow, never a silent auto-close cascade.
    const firstRoundTimes = computeRoundTimes({
      schedule: group.schedule,
      startDate: args.startDate,
      meetingTime: group.meetingTime,
      graceDays: group.graceDays,
      roundIndex: 1,
    });
    if (firstRoundTimes.dueAt <= Date.now()) {
      throw new Error('Start date must be today or in the future');
    }

    const previousCycles = await ctx.db
      .query('cycles')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();

    const now = Date.now();
    const cycleId = await ctx.db.insert('cycles', {
      groupId: args.groupId,
      index: previousCycles.length + 1,
      status: 'active',
      rotationOrder: args.rotationOrder,
      contributionAmount: group.contributionAmount,
      schedule: group.schedule,
      beneficiaryContributes: group.beneficiaryContributes,
      collectionMode: group.collectionMode,
      graceDays: group.graceDays,
      startDate: args.startDate,
      lockedAt: now,
    });

    // Bulk-generate the whole cycle: one round per rotation position (02 §a).
    for (let i = 0; i < args.rotationOrder.length; i++) {
      const times = computeRoundTimes({
        schedule: group.schedule,
        startDate: args.startDate,
        meetingTime: group.meetingTime,
        graceDays: group.graceDays,
        roundIndex: i + 1,
      });
      await ctx.db.insert('rounds', {
        cycleId,
        groupId: args.groupId,
        index: i + 1,
        beneficiaryMembershipId: args.rotationOrder[i],
        scheduledOpenAt: times.scheduledOpenAt,
        dueAt: times.dueAt,
        graceEndAt: times.graceEndAt,
        status: 'scheduled',
        expectedAmountPerMember: group.contributionAmount,
      });
    }

    // Members who joined mid-cycle are now in the drafted order (02 edge
    // case 4: "included automatically when the next cycle's order is
    // drafted") — clear the flag so round-open bills them.
    for (const member of activeMembers) {
      if (member.joinedMidCycle === true) {
        await ctx.db.patch(member._id, { joinedMidCycle: undefined });
      }
    }

    await ctx.db.patch(args.groupId, { status: 'active' });

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'cycle_started',
      entityTable: 'cycles',
      entityId: cycleId,
      toState: 'active',
      actorMembershipId: actor._id,
      note: `Cycle ${previousCycles.length + 1} — ${args.rotationOrder.length} rounds`,
    });
    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'group_status_changed',
      entityTable: 'groups',
      entityId: args.groupId,
      fromState: group.status,
      toState: 'active',
      actorMembershipId: actor._id,
    });

    return { cycleId, roundCount: args.rotationOrder.length };
  },
});

/**
 * Post-lock order change (02 §a) — president-only, mandatory note,
 * immutable orderChanges row, feed-visible. Two kinds:
 * - `swap`: two FUTURE (still `scheduled`) beneficiaries trade rounds —
 *   the « begging the turn » practice (05 M3; 02 §a files swaps under
 *   LATER but the locked MVP plan ships them — see Week 2 report).
 * - `remove`: an exited/deceased member's future round → `cancelled`;
 *   later scheduled rounds shift one period earlier (02 edges 1–2).
 * Completed/open rounds are never re-ordered. The effective beneficiary
 * order lives on rounds (I-4 as amended by 02 §a); cycles.rotationOrder
 * stays the historical locked order.
 */
export const recordOrderChange = mutation({
  args: {
    cycleId: v.id('cycles'),
    kind: orderChangeKindValidator,
    roundIndexes: v.array(v.number()), // swap: exactly 2; remove: exactly 1
    note: v.string(), // MANDATORY
  },
  returns: orderChangeResultValidator,
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) {
      throw new Error('Cycle not found');
    }
    const { membership: president } = await requireRole(ctx, cycle.groupId, [
      'president',
    ]);

    if (cycle.status !== 'active') {
      throw new Error('Order changes only apply to an active cycle');
    }
    const note = args.note.trim();
    if (!note) {
      throw new Error('A note is mandatory for every order change');
    }

    const rounds = await ctx.db
      .query('rounds')
      .withIndex('by_cycle', (q) => q.eq('cycleId', args.cycleId))
      .collect();
    const roundByIndex = new Map(rounds.map((r) => [r.index, r]));

    const targets: Doc<'rounds'>[] = [];
    for (const index of args.roundIndexes) {
      const round = roundByIndex.get(index);
      if (!round) {
        throw new Error(`Round ${index} not found in this cycle`);
      }
      if (round.status !== 'scheduled') {
        throw new Error('Only future (scheduled) rounds can be re-ordered');
      }
      targets.push(round);
    }

    let membershipIds: Id<'memberships'>[];
    if (args.kind === 'swap') {
      if (targets.length !== 2 || targets[0]._id === targets[1]._id) {
        throw new Error('A swap needs exactly two distinct future rounds');
      }
      const [a, b] = targets;
      membershipIds = [a.beneficiaryMembershipId, b.beneficiaryMembershipId];
      await ctx.db.patch(a._id, {
        beneficiaryMembershipId: b.beneficiaryMembershipId,
      });
      await ctx.db.patch(b._id, {
        beneficiaryMembershipId: a.beneficiaryMembershipId,
      });
    } else {
      if (targets.length !== 1) {
        throw new Error('A removal targets exactly one future round');
      }
      const removed = targets[0];
      const beneficiary = await ctx.db.get(removed.beneficiaryMembershipId);
      if (
        !beneficiary ||
        (beneficiary.status !== 'exited' && beneficiary.status !== 'deceased')
      ) {
        // MVP removal exists for exited/deceased members' rounds only
        // (02 §a rotation order; edges 1–2).
        throw new Error(
          'Only an exited or deceased member’s future round can be removed'
        );
      }
      membershipIds = [removed.beneficiaryMembershipId];
      await ctx.db.patch(removed._id, { status: 'cancelled' });
      await logActivityEvent(ctx, {
        groupId: cycle.groupId,
        kind: 'round_cancelled',
        entityTable: 'rounds',
        entityId: removed._id,
        fromState: 'scheduled',
        toState: 'cancelled',
        actorMembershipId: president._id,
        note,
      });

      // Remaining scheduled rounds shift one period earlier (02 edge 1):
      // each later scheduled round takes its predecessor's date slot,
      // starting from the removed round's slot. Open/closed rounds never
      // move. Guard: a removed round whose réunion already passed (a ghost
      // round the cron refused to open) must NOT hand its elapsed slot
      // down — the successor would be opened and closed by the very next
      // tick with every member frozen `unpaid`. The elapsed calendar
      // period is simply lost, as in real groups.
      if (removed.dueAt > Date.now()) {
        let previousSlot = {
          scheduledOpenAt: removed.scheduledOpenAt,
          dueAt: removed.dueAt,
          graceEndAt: removed.graceEndAt,
        };
        const laterScheduled = rounds
          .filter((r) => r.index > removed.index && r.status === 'scheduled')
          .sort((a, b) => a.index - b.index);
        for (const round of laterScheduled) {
          const ownSlot = {
            scheduledOpenAt: round.scheduledOpenAt,
            dueAt: round.dueAt,
            graceEndAt: round.graceEndAt,
          };
          await ctx.db.patch(round._id, previousSlot);
          previousSlot = ownSlot;
        }
      }
    }

    const orderChangeId = await ctx.db.insert('orderChanges', {
      cycleId: args.cycleId,
      groupId: cycle.groupId,
      kind: args.kind,
      membershipIds,
      roundIndexes: args.roundIndexes,
      presidentMembershipId: president._id,
      note,
    });

    await logActivityEvent(ctx, {
      groupId: cycle.groupId,
      kind: 'order_change',
      entityTable: 'orderChanges',
      entityId: orderChangeId,
      actorMembershipId: president._id,
      note,
    });

    // Removing the final outstanding round can complete the cycle (02 §a:
    // cancelled positions count as terminal for cycle completion).
    if (args.kind === 'remove') {
      await completeCycleIfFinished(ctx, args.cycleId);
    }

    return { orderChangeId };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * The group's active cycle with the public rotation order: beneficiary
 * names + per-round status (locked order is visible to every member —
 * trust feature #6). Returns null when no cycle is running.
 */
export const getActiveCycle = query({
  args: {
    groupId: v.id('groups'),
  },
  returns: v.union(v.null(), activeCycleValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return null;
    }
    await requireMembership(ctx, args.groupId);

    const cycle = await ctx.db
      .query('cycles')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', args.groupId).eq('status', 'active')
      )
      .first();
    if (!cycle) {
      return null;
    }

    const rounds = await ctx.db
      .query('rounds')
      .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
      .collect();
    rounds.sort((a, b) => a.index - b.index);

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    const nameByMembershipId = new Map(
      memberships.map((m) => [m._id, m.displayName])
    );

    const currentRound =
      rounds.find(
        (r) =>
          r.status === 'open' ||
          r.status === 'grace' ||
          r.status === 'closed' ||
          r.status === 'payout'
      ) ?? rounds.find((r) => r.status === 'scheduled');

    return {
      cycleId: cycle._id,
      index: cycle.index,
      status: cycle.status,
      contributionAmount: cycle.contributionAmount,
      schedule: cycle.schedule,
      collectionMode: cycle.collectionMode,
      beneficiaryContributes: cycle.beneficiaryContributes,
      graceDays: cycle.graceDays,
      startDate: cycle.startDate,
      lockedAt: cycle.lockedAt,
      currentRoundId: currentRound ? currentRound._id : null,
      rounds: rounds.map((r) => ({
        roundId: r._id,
        index: r.index,
        status: r.status,
        beneficiaryMembershipId: r.beneficiaryMembershipId,
        beneficiaryName:
          nameByMembershipId.get(r.beneficiaryMembershipId) ?? '—',
        scheduledOpenAt: r.scheduledOpenAt,
        dueAt: r.dueAt,
        graceEndAt: r.graceEndAt,
      })),
    };
  },
});
