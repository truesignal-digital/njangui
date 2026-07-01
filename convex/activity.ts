import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { getCurrentUserOrNull, requireMembership } from './utils/auth';

/**
 * Feed-visible kinds ONLY (docs/02 rows; payment-features-plan Slice 7):
 * - `payment_auto_disputed` is a PRIVATE escalation (row 7) — pushed to the
 *   parties + officers, NEVER broadcast; « litige » framing is reserved for
 *   human contests (`payment_disputed`, which IS visible).
 * - `confirm_reminder` / `obligation_status_finalized` are timer noise.
 */
const HIDDEN_KINDS = new Set([
  'payment_auto_disputed',
  'confirm_reminder',
  'obligation_status_finalized',
]);

const feedItemValidator = v.object({
  eventId: v.id('activityEvents'),
  kind: v.string(),
  entityTable: v.string(),
  entityId: v.string(),
  fromState: v.optional(v.string()),
  toState: v.optional(v.string()),
  actorName: v.union(v.string(), v.null()), // null ⇒ system actor
  note: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * Paginated group feed — immutable who-did-what-when, visible to every
 * member (trust decision 6). Renderer maps kinds to FR/EN copy client-side.
 */
export const listGroupFeed = query({
  args: {
    groupId: v.id('groups'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return { page: [], isDone: true, continueCursor: '' };
    }
    await requireMembership(ctx, args.groupId);

    const result = await ctx.db
      .query('activityEvents')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .order('desc')
      .paginate(args.paginationOpts);

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    const nameByMembershipId = new Map(
      memberships.map((m) => [m._id, m.displayName])
    );

    return {
      ...result,
      page: result.page
        .filter((event) => !HIDDEN_KINDS.has(event.kind))
        .map((event) => ({
          eventId: event._id,
          kind: event.kind,
          entityTable: event.entityTable,
          entityId: event.entityId,
          fromState: event.fromState,
          toState: event.toState,
          actorName: event.actorMembershipId
            ? (nameByMembershipId.get(event.actorMembershipId) ?? null)
            : null,
          note: event.note,
          createdAt: event._creationTime,
        })),
    };
  },
});

export { feedItemValidator };
