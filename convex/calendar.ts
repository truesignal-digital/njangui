import { type Infer, v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { handsByMembership } from './lib/roundMath';
import { addPeriods, estimatedFirstRound } from './lib/scheduleMath';
import { expectedForMember, expectedPotTotal } from './rounds';
import { getCurrentUserOrNull } from './utils/auth';

/**
 * Agenda events (docs/03) — the calendar is a projection over data that
 * already exists: locked cycles carry exact round dates; setup groups get
 * `estimated: true` rows from the same projection as the readiness card.
 * Amounts always come from `expectedForMember` (hands-aware, 02 §b).
 */
const calendarEventValidator = v.object({
  date: v.number(), // round dueAt (real) or projected meeting day (estimated)
  groupId: v.id('groups'),
  groupName: v.string(),
  roundIndex: v.number(),
  kind: v.union(v.literal('payout'), v.literal('contribution')),
  amount: v.number(),
  beneficiaryName: v.union(v.string(), v.null()), // null ⇒ rotation not locked yet
  isMyPayout: v.boolean(),
  hands: v.number(), // my hands in the cycle — UI shows « (2 mains) » when > 1
  myHandNumber: v.union(v.number(), v.null()), // which of my hands this payout is (1-based); null unless my multi-hand payout
  estimated: v.boolean(),
});

export type CalendarEvent = Infer<typeof calendarEventValidator>;

async function groupEvents(
  ctx: QueryCtx,
  group: Doc<'groups'>,
  myMembership: Doc<'memberships'>
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  if (group.status === 'setup' || group.status === 'between_cycles') {
    // Projection identical to the readiness card: one round per active
    // member, first on the next meeting day. No beneficiary — the order
    // does not exist until the president locks it (between cycles the
    // NEXT order doesn't exist yet either).
    const active = (
      await ctx.db
        .query('memberships')
        .withIndex('by_group', (q) => q.eq('groupId', group._id))
        .collect()
    ).filter((m) => m.status === 'active');
    if (active.length < 2) {
      return events;
    }
    const start = estimatedFirstRound(new Date(), group.meetingDayOfWeek);
    for (let i = 0; i < active.length; i++) {
      events.push({
        date: addPeriods(start, group.schedule, i).getTime(),
        groupId: group._id,
        groupName: group.name,
        roundIndex: i + 1,
        kind: 'contribution',
        amount: group.contributionAmount,
        beneficiaryName: null,
        isMyPayout: false,
        hands: 1,
        myHandNumber: null,
        estimated: true,
      });
    }
    return events;
  }

  const cycle = await ctx.db
    .query('cycles')
    .withIndex('by_group_and_status', (q) =>
      q.eq('groupId', group._id).eq('status', 'active')
    )
    .first();
  if (!cycle) {
    return events;
  }

  const members = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', group._id))
    .collect();
  const nameOf = new Map(members.map((m) => [m._id, m.displayName]));
  const myHands =
    handsByMembership(cycle.rotationOrder).get(myMembership._id) ?? 0;

  const rounds = await ctx.db
    .query('rounds')
    .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
    .collect();

  for (const round of rounds) {
    if (round.status === 'cancelled') {
      continue;
    }
    const pot = expectedPotTotal(cycle, round);
    const isMyPayout = round.beneficiaryMembershipId === myMembership._id;
    events.push({
      date: round.dueAt,
      groupId: group._id,
      groupName: group.name,
      roundIndex: round.index,
      kind: 'payout',
      amount: pot,
      beneficiaryName: nameOf.get(round.beneficiaryMembershipId) ?? '—',
      isMyPayout,
      hands: myHands,
      // « deux mains » clarity: round.index is 1-based over rotation
      // positions, so counting my occurrences up to it names THIS hand.
      myHandNumber:
        isMyPayout && myHands > 1
          ? cycle.rotationOrder
              .slice(0, round.index)
              .filter((id) => id === myMembership._id).length
          : null,
      estimated: false,
    });
    const myDue = expectedForMember(cycle, round, myMembership._id);
    if (myDue > 0) {
      events.push({
        date: round.dueAt,
        groupId: group._id,
        groupName: group.name,
        roundIndex: round.index,
        kind: 'contribution',
        amount: myDue,
        beneficiaryName: nameOf.get(round.beneficiaryMembershipId) ?? '—',
        isMyPayout: false,
        hands: myHands,
        myHandNumber: null,
        estimated: false,
      });
    }
  }
  return events;
}

/**
 * My agenda — every group I'm active in (or one group via `groupId`):
 * per round a `payout` row (who collects, full pot) and, when I owe, a
 * `contribution` row with MY hands-adjusted amount. Sorted by date.
 */
export const myAgenda = query({
  args: { groupId: v.optional(v.id('groups')) },
  returns: v.array(calendarEventValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return [];
    }
    const memberships = (
      await ctx.db
        .query('memberships')
        .withIndex('by_user', (q) => q.eq('userId', auth.user._id))
        .collect()
    ).filter(
      (m) =>
        m.status === 'active' &&
        (args.groupId === undefined || m.groupId === args.groupId)
    );

    const events: CalendarEvent[] = [];
    for (const membership of memberships) {
      const group = await ctx.db.get(membership.groupId);
      if (!group || group.status === 'archived') {
        continue;
      }
      events.push(...(await groupEvents(ctx, group, membership)));
    }
    return events.sort((a, b) => a.date - b.date);
  },
});
