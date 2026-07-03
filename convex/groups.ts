import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx, query } from './_generated/server';
import {
  GRACE_DAYS_DEFAULT,
  GRACE_DAYS_MAX,
  GRACE_DAYS_MIN,
} from './lib/paymentStateMachine';
import { computePotProgress } from './lib/roundMath';
import { expectedForMember, expectedPotTotal } from './rounds';
import {
  appLanguageValidator,
  collectionModeValidator,
  groupStatusValidator,
  membershipRoleValidator,
  membershipStatusValidator,
  scheduleValidator,
} from './schema';
import { logActivityEvent } from './utils/activity';
import {
  getCurrentUser,
  getCurrentUserOrNull,
  requireMembership,
  requireRole,
} from './utils/auth';

// ============================================================================
// Invite codes — 6 chars, uppercase, no 0/O/1/I (02 §a, designed for WhatsApp)
// ============================================================================

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 6;

function randomInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code +=
      INVITE_CODE_ALPHABET[
        Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)
      ];
  }
  return code;
}

export async function generateUniqueInviteCode(
  ctx: MutationCtx
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode();
    const existing = await ctx.db
      .query('groups')
      .withIndex('by_invite_code', (q) => q.eq('inviteCode', code))
      .first();
    if (!existing) {
      return code;
    }
  }
  throw new Error('Could not generate a unique invite code');
}

// ============================================================================
// Shared validation
// ============================================================================

const MEETING_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // 'HH:mm', Africa/Douala

function assertGroupSettings(settings: {
  schedule: 'weekly' | 'biweekly' | 'monthly';
  meetingDayOfWeek: number | undefined;
  meetingTime: string | undefined;
  contributionAmount: number;
  graceDays: number;
  lateFineAmount: number | undefined;
}) {
  if (
    !Number.isInteger(settings.contributionAmount) ||
    settings.contributionAmount <= 0
  ) {
    throw new Error(
      'Contribution amount must be a positive whole number of XAF'
    );
  }
  if (
    !Number.isInteger(settings.graceDays) ||
    settings.graceDays < GRACE_DAYS_MIN ||
    settings.graceDays > GRACE_DAYS_MAX
  ) {
    throw new Error(
      `Grace days must be between ${GRACE_DAYS_MIN} and ${GRACE_DAYS_MAX}`
    );
  }
  // 01 §3.1: meetingDayOfWeek required for weekly/biweekly (mutation-enforced).
  if (
    settings.schedule !== 'monthly' &&
    settings.meetingDayOfWeek === undefined
  ) {
    throw new Error(
      'Meeting day of week is required for weekly and biweekly schedules'
    );
  }
  if (
    settings.meetingDayOfWeek !== undefined &&
    (!Number.isInteger(settings.meetingDayOfWeek) ||
      settings.meetingDayOfWeek < 0 ||
      settings.meetingDayOfWeek > 6)
  ) {
    throw new Error('Meeting day of week must be 0–6 (Sunday–Saturday)');
  }
  if (
    settings.meetingTime !== undefined &&
    !MEETING_TIME_RE.test(settings.meetingTime)
  ) {
    throw new Error('Meeting time must be HH:mm');
  }
  if (
    settings.lateFineAmount !== undefined &&
    (!Number.isInteger(settings.lateFineAmount) || settings.lateFineAmount <= 0)
  ) {
    throw new Error('Late fine amount must be a positive whole number of XAF');
  }
}

// ============================================================================
// Reusable return type validators
// ============================================================================

const createGroupResultValidator = v.object({
  groupId: v.id('groups'),
  membershipId: v.id('memberships'),
  inviteCode: v.string(),
});

const groupDetailValidator = v.object({
  _id: v.id('groups'),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  city: v.optional(v.string()),
  schedule: scheduleValidator,
  meetingDayOfWeek: v.optional(v.number()),
  meetingTime: v.optional(v.string()),
  contributionAmount: v.number(),
  targetMemberCount: v.optional(v.number()),
  graceDays: v.number(),
  finesEnabled: v.boolean(),
  lateFineAmount: v.optional(v.number()),
  beneficiaryContributes: v.boolean(),
  collectionMode: collectionModeValidator,
  inviteCode: v.string(),
  status: groupStatusValidator,
  language: v.optional(appLanguageValidator),
  colorSeed: v.union(v.number(), v.null()),
  memberCount: v.number(), // active memberships
  pendingCount: v.number(), // pending_approval memberships
  viewerMembershipId: v.id('memberships'),
  viewerRole: membershipRoleValidator,
  viewerStatus: membershipStatusValidator,
});

const myGroupItemValidator = v.object({
  groupId: v.id('groups'),
  name: v.string(),
  status: groupStatusValidator,
  schedule: scheduleValidator,
  contributionAmount: v.number(),
  memberCount: v.number(),
  membershipId: v.id('memberships'),
  role: membershipRoleValidator,
  membershipStatus: membershipStatusValidator,
  colorSeed: v.union(v.number(), v.null()),
  // Active-cycle card facts — null when no cycle is running.
  cycleProgress: v.union(
    v.object({ done: v.number(), total: v.number() }),
    v.null()
  ),
  nextDueAt: v.union(v.number(), v.null()),
  // Viewer money position (money-hero home) — server-computed so the client
  // never does cross-group money math. `myDue` = what the viewer still owes
  // on the round currently collecting (expectedForMember minus confirmed +
  // in-flight); `receiving` = the full expected pot of the next
  // non-completed round when the viewer is its beneficiary.
  myDue: v.union(
    v.object({
      roundId: v.id('rounds'),
      amount: v.number(),
      dueAt: v.number(),
    }),
    v.null()
  ),
  receiving: v.union(
    v.object({ amount: v.number(), date: v.number() }),
    v.null()
  ),
  // Group-tab roster health (round-2 §2): who has fully paid the round
  // currently collecting. Counted per member against expectedForMember —
  // never per record, so partial-claim splits don't inflate the tally.
  roundHealth: v.union(
    v.object({ confirmed: v.number(), expected: v.number() }),
    v.null()
  ),
  // Up to 5 active members for the card's avatar stack. Initials only —
  // no extra doc reads beyond the memberships already collected.
  memberPreview: v.array(v.object({ initials: v.string(), paid: v.boolean() })),
  currentReceiverName: v.union(v.string(), v.null()),
});

/** « Mariam Ndip » → « MN » — server twin of the client's groupInitials. */
function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const inviteCodeResultValidator = v.object({
  inviteCode: v.string(),
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a group in `setup` (02 §a). The creator picks their ACTUAL role —
 * président or trésorier (02 DECISION: the champion/buyer is often the
 * treasurer; auto-crowning them "président" would strip the real president
 * of authority). During `setup` the creator administers regardless of role;
 * the cycle-lock guard (Week 2) requires both roles assigned.
 */
export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    schedule: scheduleValidator,
    meetingDayOfWeek: v.optional(v.number()),
    meetingTime: v.optional(v.string()),
    contributionAmount: v.number(),
    targetMemberCount: v.optional(v.number()), // informational goal, never a guard
    graceDays: v.optional(v.number()), // default 2 — the ONLY group-configurable timer (02)
    finesEnabled: v.optional(v.boolean()), // default false — fines are opt-in (02 §f)
    lateFineAmount: v.optional(v.number()),
    beneficiaryContributes: v.optional(v.boolean()), // default true
    collectionMode: v.optional(collectionModeValidator), // default 'via_treasurer' (02 §a DECISION)
    language: v.optional(appLanguageValidator),
    creatorRole: v.union(v.literal('president'), v.literal('treasurer')),
  },
  returns: createGroupResultValidator,
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new Error('Group name is required');
    }

    const graceDays = args.graceDays ?? GRACE_DAYS_DEFAULT;
    assertGroupSettings({
      schedule: args.schedule,
      meetingDayOfWeek: args.meetingDayOfWeek,
      meetingTime: args.meetingTime,
      contributionAmount: args.contributionAmount,
      graceDays,
      lateFineAmount: args.lateFineAmount,
    });

    const inviteCode = await generateUniqueInviteCode(ctx);

    const groupId = await ctx.db.insert('groups', {
      name,
      description: args.description,
      city: args.city,
      schedule: args.schedule,
      meetingDayOfWeek: args.meetingDayOfWeek,
      meetingTime: args.meetingTime,
      contributionAmount: args.contributionAmount,
      ...(args.targetMemberCount !== undefined &&
        args.targetMemberCount >= 2 && {
          targetMemberCount: Math.floor(args.targetMemberCount),
        }),
      colorSeed: Math.floor(Math.random() * 360), // group identity hue — shared by all members
      graceDays,
      finesEnabled: args.finesEnabled ?? false,
      lateFineAmount: args.lateFineAmount,
      beneficiaryContributes: args.beneficiaryContributes ?? true,
      collectionMode: args.collectionMode ?? 'via_treasurer',
      inviteCode,
      status: 'setup',
      language: args.language ?? 'fr',
      createdByUserId: user._id,
    });

    const membershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: user._id,
      phone: user.phone,
      displayName: user.name,
      role: args.creatorRole,
      status: 'active',
      joinedAt: Date.now(),
    });

    await logActivityEvent(ctx, {
      groupId,
      kind: 'group_created',
      entityTable: 'groups',
      entityId: groupId,
      actorMembershipId: membershipId,
      note: name,
    });

    return { groupId, membershipId, inviteCode };
  },
});

/**
 * Edit group settings — allowed in `setup` ONLY for now (02 §a allows
 * `between_cycles` edits too, but that state is unreachable until the cycle
 * engine ships in Week 2; extend the guard then).
 */
export const updateGroupSettings = mutation({
  args: {
    groupId: v.id('groups'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    schedule: v.optional(scheduleValidator),
    meetingDayOfWeek: v.optional(v.number()),
    meetingTime: v.optional(v.string()),
    contributionAmount: v.optional(v.number()),
    targetMemberCount: v.optional(v.number()),
    graceDays: v.optional(v.number()),
    finesEnabled: v.optional(v.boolean()),
    lateFineAmount: v.optional(v.number()),
    beneficiaryContributes: v.optional(v.boolean()),
    collectionMode: v.optional(collectionModeValidator),
    language: v.optional(appLanguageValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // During `setup` the creator administers regardless of which officer
    // role they picked (02 §a) — so president OR treasurer may edit.
    const { membership } = await requireRole(ctx, args.groupId, [
      'president',
      'treasurer',
    ]);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    if (group.status !== 'setup') {
      throw new Error('Group settings are locked outside setup');
    }

    const name = args.name?.trim();
    if (name !== undefined && !name) {
      throw new Error('Group name is required');
    }

    // Validate the EFFECTIVE post-edit settings, not just the changed fields.
    assertGroupSettings({
      schedule: args.schedule ?? group.schedule,
      meetingDayOfWeek: args.meetingDayOfWeek ?? group.meetingDayOfWeek,
      meetingTime: args.meetingTime ?? group.meetingTime,
      contributionAmount: args.contributionAmount ?? group.contributionAmount,
      graceDays: args.graceDays ?? group.graceDays,
      lateFineAmount: args.lateFineAmount ?? group.lateFineAmount,
    });

    await ctx.db.patch(args.groupId, {
      ...(name !== undefined && { name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.city !== undefined && { city: args.city }),
      ...(args.schedule !== undefined && { schedule: args.schedule }),
      ...(args.meetingDayOfWeek !== undefined && {
        meetingDayOfWeek: args.meetingDayOfWeek,
      }),
      ...(args.meetingTime !== undefined && { meetingTime: args.meetingTime }),
      ...(args.contributionAmount !== undefined && {
        contributionAmount: args.contributionAmount,
      }),
      ...(args.targetMemberCount !== undefined && {
        targetMemberCount:
          args.targetMemberCount >= 2
            ? Math.floor(args.targetMemberCount)
            : undefined,
      }),
      ...(args.graceDays !== undefined && { graceDays: args.graceDays }),
      ...(args.finesEnabled !== undefined && {
        finesEnabled: args.finesEnabled,
      }),
      ...(args.lateFineAmount !== undefined && {
        lateFineAmount: args.lateFineAmount,
      }),
      ...(args.beneficiaryContributes !== undefined && {
        beneficiaryContributes: args.beneficiaryContributes,
      }),
      ...(args.collectionMode !== undefined && {
        collectionMode: args.collectionMode,
      }),
      ...(args.language !== undefined && { language: args.language }),
    });

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'group_settings_updated',
      entityTable: 'groups',
      entityId: args.groupId,
      actorMembershipId: membership._id,
    });

    return null;
  },
});

/**
 * Regenerate the invite code (02 §a: regeneration invalidates the old code).
 */
export const generateInviteCode = mutation({
  args: {
    groupId: v.id('groups'),
  },
  returns: inviteCodeResultValidator,
  handler: async (ctx, args) => {
    const { membership } = await requireRole(ctx, args.groupId, [
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

    const inviteCode = await generateUniqueInviteCode(ctx);
    await ctx.db.patch(args.groupId, { inviteCode });

    await logActivityEvent(ctx, {
      groupId: args.groupId,
      kind: 'invite_code_regenerated',
      entityTable: 'groups',
      entityId: args.groupId,
      actorMembershipId: membership._id,
    });

    return { inviteCode };
  },
});

// ============================================================================
// Queries
// ============================================================================

export const getGroup = query({
  args: {
    groupId: v.id('groups'),
  },
  returns: v.union(v.null(), groupDetailValidator),
  handler: async (ctx, args) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return null;
    }

    // 04 §B: every group-scoped read verifies membership first.
    const { membership } = await requireMembership(ctx, args.groupId);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      return null;
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();

    return {
      _id: group._id,
      _creationTime: group._creationTime,
      name: group.name,
      description: group.description,
      city: group.city,
      schedule: group.schedule,
      meetingDayOfWeek: group.meetingDayOfWeek,
      meetingTime: group.meetingTime,
      contributionAmount: group.contributionAmount,
      targetMemberCount: group.targetMemberCount,
      graceDays: group.graceDays,
      finesEnabled: group.finesEnabled,
      lateFineAmount: group.lateFineAmount,
      beneficiaryContributes: group.beneficiaryContributes,
      collectionMode: group.collectionMode,
      inviteCode: group.inviteCode,
      status: group.status,
      language: group.language,
      colorSeed: group.colorSeed ?? null,
      memberCount: memberships.filter((m) => m.status === 'active').length,
      pendingCount: memberships.filter((m) => m.status === 'pending_approval')
        .length,
      viewerMembershipId: membership._id,
      viewerRole: membership.role,
      viewerStatus: membership.status,
    };
  },
});

export const listMyGroups = query({
  args: {},
  returns: v.array(myGroupItemValidator),
  handler: async (ctx) => {
    const auth = await getCurrentUserOrNull(ctx);
    if (!auth) {
      return [];
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', auth.user._id))
      .collect();

    const items = await Promise.all(
      memberships
        .filter((m) => m.status !== 'rejected')
        .map(async (m) => {
          const group = await ctx.db.get(m.groupId);
          if (!group) {
            return null;
          }
          const groupMemberships = await ctx.db
            .query('memberships')
            .withIndex('by_group', (q) => q.eq('groupId', m.groupId))
            .collect();

          // Card facts for a running cycle: ring progress + next due date.
          let cycleProgress: { done: number; total: number } | null = null;
          let nextDueAt: number | null = null;
          let myDue: {
            roundId: Id<'rounds'>;
            amount: number;
            dueAt: number;
          } | null = null;
          let receiving: { amount: number; date: number } | null = null;
          let roundHealth: { confirmed: number; expected: number } | null =
            null;
          let memberPreview: { initials: string; paid: boolean }[] = [];
          let currentReceiverName: string | null = null;
          if (group.status === 'active') {
            const cycle = await ctx.db
              .query('cycles')
              .withIndex('by_group_and_status', (q) =>
                q.eq('groupId', group._id).eq('status', 'active')
              )
              .first();
            if (cycle) {
              const rounds = await ctx.db
                .query('rounds')
                .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
                .collect();
              const live = rounds.filter((r) => r.status !== 'cancelled');
              const done = live.filter((r) => r.status === 'completed').length;
              cycleProgress = { done, total: live.length };
              const upcoming = live
                .filter((r) => r.status !== 'completed')
                .sort((a, b) => a.dueAt - b.dueAt);
              nextDueAt = upcoming[0]?.dueAt ?? null;

              // The round currently collecting (open/grace) drives both the
              // viewer's due and the card's roster health. One bounded
              // indexed read (that round's contribution records); expected
              // amounts ONLY via expectedForMember (hands-aware).
              const collecting = upcoming.find(
                (r) => r.status === 'open' || r.status === 'grace'
              );
              /** payerMembershipId → fully paid (confirmed ≥ expected). */
              const paidByMember = new Map<string, boolean>();
              if (collecting) {
                const contributions = await ctx.db
                  .query('paymentRecords')
                  .withIndex('by_round_and_kind', (q) =>
                    q.eq('roundId', collecting._id).eq('kind', 'contribution')
                  )
                  .collect();
                const byPayer = new Map<string, typeof contributions>();
                for (const record of contributions) {
                  const rows = byPayer.get(record.payerMembershipId) ?? [];
                  rows.push(record);
                  byPayer.set(record.payerMembershipId, rows);
                }
                let confirmedCount = 0;
                for (const [payerId, rows] of byPayer) {
                  const expected = expectedForMember(
                    cycle,
                    collecting,
                    payerId as Id<'memberships'>
                  );
                  if (expected <= 0) continue;
                  const progress = computePotProgress(
                    rows.map((r) => ({
                      state: r.state,
                      amount: r.amount,
                      claimedAt: r.claimedAt,
                    }))
                  );
                  const paid = progress.confirmedAmount >= expected;
                  paidByMember.set(payerId, paid);
                  if (paid) confirmedCount++;
                }
                roundHealth = {
                  confirmed: confirmedCount,
                  expected: paidByMember.size,
                };

                // Viewer's remaining due — an exited member may still sit in
                // the immutable rotationOrder but owes nothing.
                if (m.status === 'active') {
                  const expected = expectedForMember(cycle, collecting, m._id);
                  if (expected > 0) {
                    const mine = computePotProgress(
                      (byPayer.get(m._id) ?? []).map((r) => ({
                        state: r.state,
                        amount: r.amount,
                        claimedAt: r.claimedAt,
                      }))
                    );
                    const remaining =
                      expected - mine.confirmedAmount - mine.inFlightAmount;
                    if (remaining > 0) {
                      myDue = {
                        roundId: collecting._id,
                        amount: remaining,
                        dueAt: collecting.dueAt,
                      };
                    }
                  }
                }
              }

              // Card roster stack: first 5 active members, viewer first so
              // people recognize themselves in their own groups.
              const activeMembers = groupMemberships
                .filter((gm) => gm.status === 'active')
                .sort((a, b) =>
                  a._id === m._id ? -1 : b._id === m._id ? 1 : 0
                );
              memberPreview = activeMembers.slice(0, 5).map((gm) => ({
                initials: personInitials(gm.displayName),
                paid: paidByMember.get(gm._id) ?? false,
              }));

              // Whose turn is the next pot? (name for the card's round line)
              const next = upcoming[0];
              if (next) {
                currentReceiverName =
                  groupMemberships.find(
                    (gm) => gm._id === next.beneficiaryMembershipId
                  )?.displayName ?? null;
                if (m.status === 'active' && next.beneficiaryMembershipId === m._id) {
                  receiving = {
                    amount: expectedPotTotal(cycle, next),
                    date: next.dueAt,
                  };
                }
              }
            }
          }

          return {
            groupId: group._id,
            name: group.name,
            status: group.status,
            schedule: group.schedule,
            contributionAmount: group.contributionAmount,
            memberCount: groupMemberships.filter((gm) => gm.status === 'active')
              .length,
            membershipId: m._id,
            role: m.role,
            membershipStatus: m.status,
            colorSeed: group.colorSeed ?? null,
            cycleProgress,
            nextDueAt,
            myDue,
            receiving,
            roundHealth,
            memberPreview,
            currentReceiverName,
          };
        })
    );

    /*
     * One row per group. A user can end up with two memberships in the
     * same group (added manually AND linked by phone) — duplicate rows
     * would show the group twice and collide list keys client-side.
     * The rows describe the same person in the same group, so their
     * money facts MERGE (a due on one twin and a receiving on the other
     * are both real); the due-bearing row wins as the base because its
     * myDue.roundId drives the pay flow.
     */
    const deduped = new Map<string, NonNullable<(typeof items)[number]>>();
    for (const item of items) {
      if (item === null) continue;
      const existing = deduped.get(item.groupId);
      if (!existing) {
        deduped.set(item.groupId, item);
        continue;
      }
      const money = (row: typeof item) =>
        (row.myDue !== null ? 2 : 0) + (row.receiving !== null ? 1 : 0);
      const active = (row: typeof item) =>
        row.membershipStatus === 'active' ? 1 : 0;
      const winner =
        money(item) > money(existing) ||
        (money(item) === money(existing) && active(item) > active(existing))
          ? item
          : existing;
      const loser = winner === item ? existing : item;
      deduped.set(item.groupId, {
        ...winner,
        myDue: winner.myDue ?? loser.myDue,
        receiving: winner.receiving ?? loser.receiving,
      });
    }
    return [...deduped.values()];
  },
});
