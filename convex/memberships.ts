import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query } from './_generated/server';
import { membershipRoleValidator, membershipStatusValidator } from './schema';
import { logActivityEvent } from './utils/activity';
import { getCurrentUser, getCurrentUserOrNull, requireMembership, requireRole } from './utils/auth';
import { isValidE164, normalizePhone } from './utils/phone';

// Hard cap on active + pending memberships per group (02 §a, 05 Week 6
// DECISION). Both approval and direct add are rejected above it.
const MEMBERSHIP_CAP = 40;

// ============================================================================
// Reusable return type validators
// ============================================================================

const joinViaCodeResultValidator = v.object({
  membershipId: v.id('memberships'),
  groupId: v.id('groups'),
  groupName: v.string(),
  membershipStatus: membershipStatusValidator,
});

const memberListItemValidator = v.object({
  membershipId: v.id('memberships'),
  displayName: v.string(),
  role: membershipRoleValidator,
  status: membershipStatusValidator,
  joinedAt: v.number(),
  joinedMidCycle: v.optional(v.boolean()),
  hasAccount: v.boolean(), // userId present — drives on-behalf rules (02 §c row 4)
  // 04 §B role matrix: full-roster phone projection is gated to
  // treasurer/president viewers; member viewers get name/status only.
  phone: v.optional(v.string()),
});

const addMemberResultValidator = v.object({
  membershipId: v.id('memberships'),
});

// ============================================================================
// Helpers
// ============================================================================

async function countActiveAndPending(ctx: MutationCtx, groupId: Id<'groups'>): Promise<number> {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return memberships.filter((m) => m.status === 'active' || m.status === 'pending_approval')
    .length;
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Join a group via its invite code → Membership `pending_approval` (02 §a
 * DECISION: njangis are closed trust circles; an open link must never
 * auto-admit — president or treasurer approves). The code stays valid during
 * active cycles; mid-cycle joins land in the « Prochain cycle » list at
 * approval (edge case 4). Idempotent for an existing pending/active row.
 */
export const joinViaCode = mutation({
  args: {
    code: v.string(),
  },
  returns: joinViaCodeResultValidator,
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);

    const code = args.code.trim().toUpperCase();
    const group = await ctx.db
      .query('groups')
      .withIndex('by_invite_code', (q) => q.eq('inviteCode', code))
      .unique();

    if (!group || group.status === 'archived') {
      throw new Error('Invalid invite code');
    }

    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_group_and_user', (q) => q.eq('groupId', group._id).eq('userId', user._id))
      .unique();

    if (existing) {
      if (existing.status === 'pending_approval' || existing.status === 'active') {
        return {
          membershipId: existing._id,
          groupId: group._id,
          groupName: group.name,
          membershipStatus: existing.status,
        };
      }
      // rejected / exited / deceased are terminal (02 §a membership states);
      // re-admission is an officer decision, not a self-serve rejoin.
      throw new Error('You cannot rejoin this group with the invite code');
    }

    const membershipId = await ctx.db.insert('memberships', {
      groupId: group._id,
      userId: user._id,
      phone: user.phone,
      displayName: user.name,
      role: 'member',
      status: 'pending_approval',
      joinedAt: Date.now(),
    });

    await logActivityEvent(ctx, {
      groupId: group._id,
      kind: 'member_join_requested',
      entityTable: 'memberships',
      entityId: membershipId,
      actorMembershipId: membershipId,
      note: user.name,
    });

    return {
      membershipId,
      groupId: group._id,
      groupName: group.name,
      membershipStatus: 'pending_approval' as const,
    };
  },
});

/**
 * Approve a pending join (president/treasurer, 04 §B role matrix). Rejected
 * above the 40-membership cap. While a cycle is active the new member is
 * flagged `joinedMidCycle` — no rounds, no obligations until the next cycle
 * (02 edge case 4).
 */
export const approveMember = mutation({
  args: {
    membershipId: v.id('memberships'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.membershipId);
    if (!target) {
      throw new Error('Membership not found');
    }

    const { membership: actor } = await requireRole(ctx, target.groupId, [
      'president',
      'treasurer',
    ]);

    if (target.status === 'active') {
      return null; // idempotent
    }
    if (target.status !== 'pending_approval') {
      throw new Error('Only pending memberships can be approved');
    }

    const count = await countActiveAndPending(ctx, target.groupId);
    if (count > MEMBERSHIP_CAP) {
      throw new Error(`Group is over the ${MEMBERSHIP_CAP}-membership cap`);
    }

    const group = await ctx.db.get(target.groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    await ctx.db.patch(target._id, {
      status: 'active',
      ...(group.status === 'active' && { joinedMidCycle: true }),
    });

    await logActivityEvent(ctx, {
      groupId: target.groupId,
      kind: 'member_approved',
      entityTable: 'memberships',
      entityId: target._id,
      fromState: 'pending_approval',
      toState: 'active',
      actorMembershipId: actor._id,
      note: target.displayName,
    });

    return null;
  },
});

export const rejectMember = mutation({
  args: {
    membershipId: v.id('memberships'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.membershipId);
    if (!target) {
      throw new Error('Membership not found');
    }

    const { membership: actor } = await requireRole(ctx, target.groupId, [
      'president',
      'treasurer',
    ]);

    if (target.status === 'rejected') {
      return null; // idempotent
    }
    if (target.status !== 'pending_approval') {
      throw new Error('Only pending memberships can be rejected');
    }

    await ctx.db.patch(target._id, { status: 'rejected' });

    await logActivityEvent(ctx, {
      groupId: target.groupId,
      kind: 'member_rejected',
      entityTable: 'memberships',
      entityId: target._id,
      fromState: 'pending_approval',
      toState: 'rejected',
      actorMembershipId: actor._id,
      note: target.displayName,
    });

    return null;
  },
});

/**
 * Direct add by treasurer/president (02 §a: the champion onboards 15–30
 * members) — name + E.164 phone, Membership `active` immediately, no
 * approval step. `userId` stays absent (`hasAccount: false`) unless a user
 * already holds that phone, in which case the membership is linked at once;
 * later Clerk sign-ups link via phone match (users.linkMembershipsByPhone).
 */
export const addFeaturePhoneMember = mutation({
  args: {
    groupId: v.id('groups'),
    name: v.string(),
    phone: v.string(),
  },
  returns: addMemberResultValidator,
  handler: async (ctx, args) => {
    const { membership: actor } = await requireRole(ctx, args.groupId, [
      'president',
      'treasurer',
    ]);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    if (group.status === 'archived') {
      throw new Error('Group is archived');
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error('Member name is required');
    }

    const phone = normalizePhone(args.phone);
    if (!isValidE164(phone)) {
      throw new Error('Phone must be E.164, e.g. +2376XXXXXXXX');
    }

    // Direct add is rejected above the same 40-membership cap (02 §a).
    const count = await countActiveAndPending(ctx, args.groupId);
    if (count >= MEMBERSHIP_CAP) {
      throw new Error(`Group is at the ${MEMBERSHIP_CAP}-membership cap`);
    }

    // Duplicate guards: the phone must not already belong to a membership in
    // this group, and a user holding the phone must not already be a member.
    const samePhone = await ctx.db
      .query('memberships')
      .withIndex('by_phone', (q) => q.eq('phone', phone))
      .collect();
    if (samePhone.some((m) => m.groupId === args.groupId)) {
      throw new Error('This phone number already has a membership in this group');
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_phone', (q) => q.eq('phone', phone))
      .first();
    if (existingUser) {
      const existingMembership = await ctx.db
        .query('memberships')
        .withIndex('by_group_and_user', (q) =>
          q.eq('groupId', args.groupId).eq('userId', existingUser._id)
        )
        .unique();
      if (existingMembership) {
        throw new Error('This person already has a membership in this group');
      }
    }

    const membershipId = await ctx.db.insert('memberships', {
      groupId: args.groupId,
      userId: existingUser?._id,
      phone,
      displayName: name,
      role: 'member',
      status: 'active',
      ...(group.status === 'active' && { joinedMidCycle: true }),
      joinedAt: Date.now(),
    });

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'member_added',
      entityTable: 'memberships',
      entityId: membershipId,
      toState: 'active',
      actorMembershipId: actor._id,
      note: name,
    });

    return { membershipId };
  },
});

/**
 * Reassign the single treasurer role (president-only, 02 §e5). The previous
 * treasurer is demoted to `member`.
 */
export const reassignTreasurer = mutation({
  args: {
    groupId: v.id('groups'),
    membershipId: v.id('memberships'), // the new treasurer
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { membership: president } = await requireRole(ctx, args.groupId, ['president']);

    const target = await ctx.db.get(args.membershipId);
    if (!target || target.groupId !== args.groupId) {
      throw new Error('Membership not found in this group');
    }
    if (target.status !== 'active') {
      throw new Error('Treasurer must be an active member');
    }
    if (target.role === 'treasurer') {
      return null; // idempotent
    }
    if (target.role === 'president') {
      // 02 §a allows a president-treasurer in small groups, but 01's
      // memberships.role holds ONE literal — representing the dual role
      // needs a doc/schema reconciliation first. Rejected for now.
      throw new Error('The president cannot also hold the treasurer role');
    }

    const groupMemberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    const previousTreasurer = groupMemberships.find(
      (m) => m.role === 'treasurer' && m.status === 'active'
    );

    if (previousTreasurer) {
      await ctx.db.patch(previousTreasurer._id, { role: 'member' });
    }
    await ctx.db.patch(target._id, { role: 'treasurer' });

    // TODO(Week 2, 02 §e5 treasurer-replacement): re-point
    // `payeeMembershipId` of PENDING paymentRecords only to the new
    // treasurer. `claimed`/`disputed` records keep the old treasurer as
    // payee (they assert money already handed over — the new treasurer can
    // never truthfully confirm cash they never held); `confirmed` records
    // keep the historical treasurer forever. Also show both treasurers the
    // handover statement titled « Espèces chez le trésorier (selon le
    // registre) — l'application ne détient aucun fonds ».

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'role_reassigned',
      entityTable: 'memberships',
      entityId: target._id,
      fromState: previousTreasurer ? previousTreasurer.displayName : undefined,
      toState: target.displayName,
      actorMembershipId: president._id,
      note: `Trésorier : ${target.displayName}`,
    });

    return null;
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Group roster. Phone numbers are projected ONLY for treasurer/president
 * viewers (04 §B role matrix) — member-visible rosters carry name/role/
 * status only. `rejected` rows are returned (the row is never deleted) so
 * officers can audit the approval history; UI filters as needed.
 */
export const listMembers = query({
  args: {
    groupId: v.id('groups'),
  },
  returns: v.array(memberListItemValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return [];
    }

    const { membership: viewer } = await requireMembership(ctx, args.groupId);
    const viewerIsOfficer =
      viewer.status === 'active' &&
      (viewer.role === 'president' || viewer.role === 'treasurer');

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();

    return memberships
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        membershipId: m._id,
        displayName: m.displayName,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        joinedMidCycle: m.joinedMidCycle,
        hasAccount: m.userId !== undefined,
        phone: viewerIsOfficer ? m.phone : undefined,
      }));
  },
});
