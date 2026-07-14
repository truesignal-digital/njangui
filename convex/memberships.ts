import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query } from './_generated/server';
import { notifyMemberships } from './push';
import {
  membershipRoleValidator,
  membershipStatusValidator,
  scheduleValidator,
} from './schema';
import { logActivityEvent } from './utils/activity';
import { getCurrentUser, getCurrentUserOrNull, requireMembership, requireRole } from './utils/auth';
import { isValidE164, normalizePhone } from './utils/phone';
import { groupLink } from './lib/appLinks';

// Hard cap on active + pending memberships per group (02 §a, 05 Week 6
// DECISION). Both approval and direct add are rejected above it; the
// cycle-lock guard (cycles.startCycle) reuses the same number.
export const MEMBERSHIP_CAP = 40;

// ============================================================================
// Reusable return type validators
// ============================================================================

const joinViaCodeResultValidator = v.object({
  membershipId: v.id('memberships'),
  groupId: v.id('groups'),
  groupName: v.string(),
  membershipStatus: membershipStatusValidator,
});

const invitePreviewValidator = v.union(
  v.object({
    groupName: v.string(),
    schedule: scheduleValidator,
    meetingDayOfWeek: v.optional(v.number()),
    contributionAmount: v.number(),
    memberCount: v.number(),
    atCapacity: v.boolean(),
    viewerState: v.union(
      v.literal('eligible'),
      v.literal('already_active'),
      v.literal('already_pending'),
      v.literal('unavailable')
    ),
  }),
  v.null()
);

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

const treasurerHandoverPreviewValidator = v.object({
  currentTreasurerName: v.union(v.string(), v.null()),
  pendingContributionCount: v.number(),
  pendingPayoutCount: v.number(),
  activeClaimCount: v.number(),
  custodyAmount: v.number(),
});

// ============================================================================
// Helpers
// ============================================================================

async function countActiveAndPending(ctx: MutationCtx, groupId: Id<'groups'>): Promise<number> {
  const [active, pending] = await Promise.all([
    ctx.db
      .query('memberships')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', groupId).eq('status', 'active')
      )
      .take(MEMBERSHIP_CAP + 1),
    ctx.db
      .query('memberships')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', groupId).eq('status', 'pending_approval')
      )
      .take(MEMBERSHIP_CAP + 1),
  ]);
  return active.length + pending.length;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Privacy-safe confirmation shown before a join request is created. This is
 * deliberately a narrow projection: enough to recognise the collective,
 * never its roster, officers, ledger, phone numbers, or invite code.
 */
export const previewInvite = query({
  args: {
    code: v.string(),
  },
  returns: invitePreviewValidator,
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);
    const code = args.code.trim().toUpperCase();
    const group = await ctx.db
      .query('groups')
      .withIndex('by_invite_code', (q) => q.eq('inviteCode', code))
      .unique();

    if (!group || group.status === 'archived') return null;

    const [active, pending, existing] = await Promise.all([
      ctx.db
        .query('memberships')
        .withIndex('by_group_and_status', (q) =>
          q.eq('groupId', group._id).eq('status', 'active')
        )
        .take(MEMBERSHIP_CAP + 1),
      ctx.db
        .query('memberships')
        .withIndex('by_group_and_status', (q) =>
          q.eq('groupId', group._id).eq('status', 'pending_approval')
        )
        .take(MEMBERSHIP_CAP + 1),
      ctx.db
        .query('memberships')
        .withIndex('by_group_and_user', (q) =>
          q.eq('groupId', group._id).eq('userId', user._id)
        )
        .first(),
    ]);

    const memberCount = active.length + pending.length;
    const viewerState =
      existing?.status === 'active'
        ? ('already_active' as const)
        : existing?.status === 'pending_approval'
          ? ('already_pending' as const)
          : existing
            ? ('unavailable' as const)
            : ('eligible' as const);

    return {
      groupName: group.name,
      schedule: group.schedule,
      ...(group.meetingDayOfWeek !== undefined && {
        meetingDayOfWeek: group.meetingDayOfWeek,
      }),
      contributionAmount: group.contributionAmount,
      memberCount,
      atCapacity: memberCount >= MEMBERSHIP_CAP,
      viewerState,
    };
  },
});

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

    // .first(), not .unique() — legacy dupes (manual add + phone link)
    // must block the re-join, not crash it.
    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_group_and_user', (q) => q.eq('groupId', group._id).eq('userId', user._id))
      .first();

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

    if ((await countActiveAndPending(ctx, group._id)) >= MEMBERSHIP_CAP) {
      throw new Error('This group is full');
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
 * already holds that phone (legacy OTP-verified rows), in which case the
 * membership is linked at once. Automatic phone-match linking at sign-up
 * was removed with the OTP system: a feature-phone member who later signs
 * up gets attached by an officer re-adding them, never automatically.
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
        .first();
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
 * Add an APP member by their unique username (officer-initiated — the
 * mirror of join-by-code, which is member-initiated and needs approval).
 * The username is exact-matched against the Clerk-mirrored directory; the
 * new member lands `active` immediately and is told by push (+ a courtesy
 * email when they have one) — being silently inside a money group is the
 * thing this notification prevents.
 */
export const addMemberByUsername = mutation({
  args: {
    groupId: v.id('groups'),
    username: v.string(),
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

    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique();
    if (!user || user.isDeactivated) {
      throw new Error('No account with this username');
    }

    const count = await countActiveAndPending(ctx, args.groupId);
    if (count >= MEMBERSHIP_CAP) {
      throw new Error(`Group is at the ${MEMBERSHIP_CAP}-membership cap`);
    }

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_group_and_user', (q) =>
        q.eq('groupId', args.groupId).eq('userId', user._id)
      )
      .first();
    if (existingMembership) {
      // ConvexError so the client can show a real message, not a generic one.
      throw new ConvexError({ code: 'already_member' });
    }
    // A feature-phone row seeded with this user's phone would collide once
    // they were linked — same guard as the phone-based add.
    if (user.phone !== undefined) {
      const samePhone = await ctx.db
        .query('memberships')
        .withIndex('by_phone', (q) => q.eq('phone', user.phone))
        .collect();
      if (samePhone.some((m) => m.groupId === args.groupId)) {
        throw new ConvexError({ code: 'already_member' });
      }
    }

    const membershipId = await ctx.db.insert('memberships', {
      groupId: args.groupId,
      userId: user._id,
      ...(user.phone !== undefined && { phone: user.phone }),
      displayName: user.name || user.username || username,
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
      note: user.name || username,
    });

    await notifyMemberships(ctx, [membershipId], {
      titleFr: `Ajouté(e) à « ${group.name} »`,
      titleEn: `Added to "${group.name}"`,
      bodyFr: `${actor.displayName} vous a ajouté(e) à ce njangi.`,
      bodyEn: `${actor.displayName} added you to this njangi.`,
      url: groupLink(args.groupId),
    });
    if (user.email !== undefined) {
      await ctx.scheduler.runAfter(0, internal.email.sendMemberAdded, {
        email: user.email,
        memberName: user.name || username,
        groupName: group.name,
        actorName: actor.displayName,
        language: user.language,
        membershipId,
      });
    }

    return { membershipId };
  },
});

/**
 * Assign / transfer the president role (02 §a: the creator picks their
 * ACTUAL role, so treasurer-created groups start president-less — yet the
 * cycle lock requires a president). Rules:
 * - no president yet → the TREASURER names one (the setup-era creator
 *   administers the group);
 * - president exists → only the president can hand the role over (they are
 *   demoted to member — one president per group).
 * The target must be an active member WITH the app (02 §a: transferable to
 * any active hasAccount member) and can't be the treasurer (single role).
 */
export const assignPresident = mutation({
  args: {
    groupId: v.id('groups'),
    membershipId: v.id('memberships'), // the new president
  },
  returns: v.null(),
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

    const target = await ctx.db.get(args.membershipId);
    if (!target || target.groupId !== args.groupId) {
      throw new Error('Membership not found in this group');
    }
    if (target.role === 'president') {
      return null; // idempotent
    }
    if (target.status !== 'active') {
      throw new Error('The president must be an active member');
    }
    if (target.userId === undefined) {
      throw new Error('The president must have the app');
    }
    if (target.role === 'treasurer') {
      // Mirror of reassignTreasurer's guard: one literal role per membership.
      throw new Error('The treasurer cannot also hold the president role');
    }

    const groupMemberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    const currentPresident = groupMemberships.find(
      (m) => m.role === 'president' && m.status === 'active'
    );
    if (currentPresident) {
      if (actor._id !== currentPresident._id) {
        throw new Error('Only the president can hand the role over');
      }
      await ctx.db.patch(currentPresident._id, { role: 'member' });
    }
    // else: president-less group — the treasurer (actor, via requireRole) names one.

    await ctx.db.patch(target._id, { role: 'president' });

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'role_reassigned',
      entityTable: 'memberships',
      entityId: target._id,
      toState: 'president',
      actorMembershipId: actor._id,
      note: target.displayName,
    });
    await notifyMemberships(ctx, [target._id], {
      titleFr: `Vous êtes président(e) de « ${group.name} »`,
      titleEn: `You are the president of "${group.name}"`,
      bodyFr: `${actor.displayName} vous a nommé(e) président(e). Vous pouvez définir l'ordre de rotation et démarrer le cycle.`,
      bodyEn: `${actor.displayName} named you president. You can set the rotation order and start the cycle.`,
      url: groupLink(args.groupId),
    });

    return null;
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

    if (previousTreasurer) {
      // 02 §e5 / I-2: only obligations where no money has been asserted to
      // move follow the office. Claimed/disputed/confirmed rows retain the
      // historical parties who allegedly handled the cash.
      const pendingRecords = await ctx.db
        .query('paymentRecords')
        .withIndex('by_group_and_state', (q) =>
          q.eq('groupId', args.groupId).eq('state', 'pending')
        )
        .collect();
      for (const record of pendingRecords) {
        if (
          record.kind !== 'payout' &&
          record.payeeMembershipId === previousTreasurer._id
        ) {
          await ctx.db.patch(record._id, {
            payeeMembershipId: target._id,
          });
        }
        // A pending payout is an obligation the active treasurer will carry
        // out. No claim exists yet, so changing its payer does not rewrite
        // anyone's account of money that already moved.
        if (
          record.kind === 'payout' &&
          record.payerMembershipId === previousTreasurer._id
        ) {
          await ctx.db.patch(record._id, {
            payerMembershipId: target._id,
          });
        }
      }
    }

    // The production handover statement is a separate UI task and remains
    // gated on an approved mockup. The ledger ownership change itself is
    // complete and atomic here.

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

export const getTreasurerHandoverPreview = query({
  args: { groupId: v.id('groups') },
  returns: treasurerHandoverPreviewValidator,
  handler: async (ctx, args) => {
    await requireRole(ctx, args.groupId, ['president']);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .take(MEMBERSHIP_CAP);
    const treasurer = memberships.find(
      (membership) =>
        membership.role === 'treasurer' && membership.status === 'active'
    );
    if (!treasurer) {
      return {
        currentTreasurerName: null,
        pendingContributionCount: 0,
        pendingPayoutCount: 0,
        activeClaimCount: 0,
        custodyAmount: 0,
      };
    }

    const [pending, claimed, confirmed] = await Promise.all([
      ctx.db
        .query('paymentRecords')
        .withIndex('by_group_and_state', (q) =>
          q.eq('groupId', args.groupId).eq('state', 'pending')
        )
        .take(500),
      ctx.db
        .query('paymentRecords')
        .withIndex('by_group_and_state', (q) =>
          q.eq('groupId', args.groupId).eq('state', 'claimed')
        )
        .take(500),
      ctx.db
        .query('paymentRecords')
        .withIndex('by_group_and_state', (q) =>
          q.eq('groupId', args.groupId).eq('state', 'confirmed')
        )
        .take(500),
    ]);

    const pendingContributionCount = pending.filter(
      (record) =>
        record.kind !== 'payout' &&
        record.payeeMembershipId === treasurer._id
    ).length;
    const pendingPayoutCount = pending.filter(
      (record) =>
        record.kind === 'payout' &&
        record.payerMembershipId === treasurer._id
    ).length;
    const activeClaimCount = claimed.filter(
      (record) =>
        record.payerMembershipId === treasurer._id ||
        record.payeeMembershipId === treasurer._id
    ).length;
    const confirmedIn = confirmed
      .filter(
        (record) =>
          record.kind === 'contribution' &&
          record.payeeMembershipId === treasurer._id
      )
      .reduce((sum, record) => sum + record.amount, 0);
    const confirmedOut = confirmed
      .filter(
        (record) =>
          record.kind === 'payout' &&
          record.payerMembershipId === treasurer._id
      )
      .reduce((sum, record) => sum + record.amount, 0);

    return {
      currentTreasurerName: treasurer.displayName,
      pendingContributionCount,
      pendingPayoutCount,
      activeClaimCount,
      custodyAmount: Math.max(0, confirmedIn - confirmedOut),
    };
  },
});

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
