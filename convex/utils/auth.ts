import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type MembershipRole = 'president' | 'treasurer' | 'member';

// Former members keep READ access to the ledger forever (02 §a `archived`:
// "ledger, history, and scores remain visible to all former members";
// exited/deceased rows are never deleted). `pending_approval` and `rejected`
// members have no ledger stake and see nothing group-scoped.
const READ_ELIGIBLE_STATUSES = ['active', 'exited', 'deceased'] as const;

/**
 * Get the current authenticated user from the context.
 * Throws if not authenticated or user not found.
 *
 * @example
 * const { identity, user } = await getCurrentUser(ctx);
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error('Not authenticated');
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
    .unique();

  if (!user) {
    throw new Error('User not found');
  }

  if (user.isDeactivated) {
    throw new Error('Account deactivated');
  }

  return { identity, user };
}

/**
 * Get the current authenticated user from the context, returning null if not found.
 * Use this for queries that should return empty results for unauthenticated users.
 *
 * @example
 * const result = await getCurrentUserOrNull(ctx);
 * if (!result) return [];
 * const { user } = result;
 */
export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
    .unique();

  if (!user) {
    return null;
  }

  if (user.isDeactivated) {
    return null;
  }

  return { identity, user };
}

/**
 * Require authentication for a query, returning a default value if not authenticated.
 * Useful for queries that should return a specific default for unauthenticated users.
 *
 * @example
 * const user = await requireAuthOrDefault(ctx, null);
 * if (!user) return null;
 */
/**
 * Verify the current user holds a membership in the target group (04 §B:
 * EVERY group-scoped query/mutation calls this first — there is no
 * cross-group read path in MVP). Resolves via the `by_group_and_user` index.
 * Throws 'Not a group member' otherwise.
 *
 * @example
 * const { user, membership } = await requireMembership(ctx, args.groupId);
 */
export async function requireMembership(ctx: QueryCtx | MutationCtx, groupId: Id<'groups'>) {
  const { identity, user } = await getCurrentUser(ctx);

  /*
   * NOT .unique(): a user can hold two memberships in one group (added
   * manually AND linked by phone — see linkMembershipsByPhone), and
   * .unique() would throw a Server Error at every read for that user.
   * Deterministic pick: active first, then the oldest row (the original
   * member record, which is the one locked into rotations).
   */
  const rows = await ctx.db
    .query('memberships')
    .withIndex('by_group_and_user', (q) => q.eq('groupId', groupId).eq('userId', user._id))
    .collect();
  const membership =
    rows
      .sort((a, b) =>
        a.status === 'active' && b.status !== 'active'
          ? -1
          : b.status === 'active' && a.status !== 'active'
            ? 1
            : a._creationTime - b._creationTime
      )
      .at(0) ?? null;

  if (
    !membership ||
    !READ_ELIGIBLE_STATUSES.includes(membership.status as (typeof READ_ELIGIBLE_STATUSES)[number])
  ) {
    throw new Error('Not a group member');
  }

  return { identity, user, membership };
}

/**
 * Verify membership AND role for privileged actions (04 §B role matrix).
 * Write actions additionally require an ACTIVE membership — former members
 * retain read access only. Throws 'Insufficient role'.
 *
 * @example
 * const { membership } = await requireRole(ctx, args.groupId, ['president', 'treasurer']);
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<'groups'>,
  roles: MembershipRole[]
) {
  const { identity, user, membership } = await requireMembership(ctx, groupId);

  if (membership.status !== 'active') {
    throw new Error('Not a group member');
  }

  if (!roles.includes(membership.role)) {
    throw new Error('Insufficient role');
  }

  return { identity, user, membership };
}

export async function requireAuthOrDefault<T>(
  ctx: QueryCtx | MutationCtx,
  defaultValue: T
): Promise<
  | {
      identity: NonNullable<Awaited<ReturnType<typeof ctx.auth.getUserIdentity>>>;
      user: NonNullable<Awaited<ReturnType<typeof getCurrentUserOrNull>>>['user'];
    }
  | T
> {
  const result = await getCurrentUserOrNull(ctx);
  if (!result) {
    return defaultValue;
  }
  return result;
}
