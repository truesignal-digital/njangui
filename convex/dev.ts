import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, mutation } from './_generated/server';
import { performStartCycle } from './cycles';
import { devTicketForPhone } from './otp';
import { generateUniqueInviteCode } from './groups';
import { openRoundForTick } from './rounds';
import { logActivityEvent } from './utils/activity';
import { getCurrentUser, requireRole } from './utils/auth';

// ============================================================================
// DEV-ONLY seed helpers — for driving VERIFY (running the app hands-free)
// without the simulator's text-input wall. GUARDED two ways: the frontend
// only mounts the trigger under __DEV__, AND every function here refuses
// unless DEV_SEED_ENABLED='true' is set on the deployment
// (`npx convex env set DEV_SEED_ENABLED true`). Never enable on production.
// ============================================================================

function assertDevSeedEnabled() {
  if (process.env.DEV_SEED_ENABLED !== 'true') {
    throw new Error(
      'devSeed is disabled — set DEV_SEED_ENABLED=true on this deployment to use it'
    );
  }
}

// Clerk dev-instance test phones (reserved 555-01XX block, fixed OTP 424242,
// no SMS). Slot 0 is the DevAuthButton default (président); slots 1–2 are
// seeded onto the treasurer / first member memberships so signing in as them
// links those memberships via the production linkMembershipsByPhone path —
// the two-sided claim→confirm handshake becomes drivable with real
// identities and zero backend special-casing.
export const DEV_TEST_PHONES = {
  president: '+12015550100',
  treasurer: '+12015550101',
  member: '+12015550102',
} as const;

/**
 * One-tap sim sign-in for the DEV pills. User-facing auth is
 * username+password now, so the pills mint a Clerk ticket through the real
 * OTP machinery server-side (devTicketForPhone: fresh consumed challenge →
 * setVerifiedPhone → linkGuard fires like production). Double-gated:
 * DEV_SEED_ENABLED here, plus the dev OTP provider's own env gate with its
 * load-time production throw.
 */
export const devLoginTicket = action({
  args: { phone: v.string() },
  returns: v.object({
    ok: v.boolean(),
    ticket: v.optional(v.string()),
    retryAfterMs: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    return await devTicketForPhone(ctx, args.phone);
  },
});

/**
 * One-shot mirror backfill: pull username/email for existing Clerk users
 * into Convex rows (new signups sync via the webhook; rows created before
 * the mirror existed don't). Reuses updateUserFromClerk so the write path
 * stays single.
 */
export const devBackfillClerkIdentifiers = action({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx): Promise<{ updated: number }> => {
    assertDevSeedEnabled();
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) throw new Error('CLERK_SECRET_KEY not configured');
    const response = await fetch('https://api.clerk.com/v1/users?limit=100', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      throw new Error(`Clerk user list failed: ${response.status}`);
    }
    const users = (await response.json()) as {
      id: string;
      username: string | null;
      email_addresses: { id: string; email_address: string }[];
      primary_email_address_id: string | null;
    }[];
    let updated = 0;
    for (const u of users) {
      const email =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses[0]?.email_address;
      if (!u.username && !email) continue;
      const patched: string | null = await ctx.runMutation(
        internal.users.updateUserFromClerk,
        {
          clerkId: u.id,
          ...(u.username ? { username: u.username } : {}),
          ...(email ? { email } : {}),
        }
      );
      if (patched !== null) updated++;
    }
    return { updated };
  },
});

const SEED_NAMES = [
  'Awa Ndip',
  'Bisong Eyong',
  'Mballa Manga',
  'Ngu Tabi',
  'Fon Sone',
  'Etonde Ze',
  'Oben Arrey',
  'Sumelong Bih',
  'Achu Nformi',
  'Limbe Kima',
];

/**
 * Seed a setup-state group owned by the signed-in user (president), with a
 * treasurer + N feature-phone members — ready to drive « Démarrer le cycle ».
 * Also fills the user's name so onboarding is skipped. Returns the groupId.
 */
export const devSeed = mutation({
  args: {
    memberCount: v.optional(v.number()),
  },
  returns: v.object({ groupId: v.id('groups') }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const { user } = await getCurrentUser(ctx);

    // Fill the name so the auth flow doesn't bounce to onboarding.
    if (user.name.trim().length === 0 || user.name === user.phone) {
      await ctx.db.patch(user._id, { name: 'Dev Président' });
    }
    const presidentName =
      user.name.trim().length > 0 && user.name !== user.phone
        ? user.name
        : 'Dev Président';

    const count = Math.min(Math.max(args.memberCount ?? 4, 2), 10);
    const inviteCode = await generateUniqueInviteCode(ctx);
    const now = Date.now();

    const groupId = await ctx.db.insert('groups', {
      name: 'Njangi Test',
      schedule: 'monthly',
      contributionAmount: 10000,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode,
      status: 'setup',
      language: 'fr',
      createdByUserId: user._id,
    });

    const presidentMembershipId = await ctx.db.insert('memberships', {
      groupId,
      userId: user._id,
      phone: user.phone,
      displayName: presidentName,
      role: 'president',
      status: 'active',
      joinedAt: now,
    });

    // The first member is the treasurer so startCycle's treasurer guard
    // passes. Treasurer + first ordinary member carry Clerk dev test-phone
    // numbers: if that dev user already exists we attach their userId now;
    // otherwise their first dev sign-in links the membership by phone
    // (linkMembershipsByPhone). Everyone else stays feature-phone.
    for (let i = 0; i < count; i++) {
      const phone =
        i === 0
          ? DEV_TEST_PHONES.treasurer
          : i === 1
            ? DEV_TEST_PHONES.member
            : `+2376770${String(10000 + i).slice(-5)}`;
      const linkedUser =
        i <= 1
          ? await ctx.db
              .query('users')
              .withIndex('by_phone', (q) => q.eq('phone', phone))
              .first()
          : null;
      await ctx.db.insert('memberships', {
        groupId,
        ...(linkedUser && linkedUser._id !== user._id
          ? { userId: linkedUser._id }
          : {}),
        phone,
        displayName: SEED_NAMES[i % SEED_NAMES.length],
        role: i === 0 ? 'treasurer' : 'member',
        status: 'active',
        joinedAt: now + i + 1,
      });
    }

    await logActivityEvent(ctx, {
      groupId,
      kind: 'group_created',
      entityTable: 'groups',
      entityId: groupId,
      actorMembershipId: presidentMembershipId,
      note: 'dev seed',
    });

    return { groupId };
  },
});

/**
 * DEV-only: start the cycle (if not already active) and force-open the
 * first scheduled round, so the claim/confirm loop is drivable in the sim
 * without waiting for the 15-min cron. Goes through the REAL paths —
 * performStartCycle (same guards as the UI lock) and openRoundForTick
 * (same record pre-creation as the cron) — never a parallel implementation.
 */
export const devStartAndOpenRound = mutation({
  args: {
    groupId: v.id('groups'),
  },
  returns: v.object({
    roundId: v.union(v.id('rounds'), v.null()),
    opened: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const { membership: actor } = await requireRole(ctx, args.groupId, [
      'president',
    ]);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    // Start the cycle when none is active. startDate = tomorrow so the
    // future-dueAt guard passes (monthly schedule ⇒ no meeting-day check).
    if (group.status === 'setup' || group.status === 'between_cycles') {
      const memberships = await ctx.db
        .query('memberships')
        .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
        .collect();
      const rotationOrder = memberships
        .filter((m) => m.status === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => m._id);
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await performStartCycle(ctx, actor, {
        groupId: args.groupId,
        rotationOrder,
        startDate,
      });
    }

    const cycle = await ctx.db
      .query('cycles')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', args.groupId).eq('status', 'active')
      )
      .first();
    if (!cycle) {
      throw new Error('No active cycle to open a round in');
    }

    const rounds = await ctx.db
      .query('rounds')
      .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
      .collect();
    const alreadyRunning = rounds
      .filter((r) => r.status === 'open' || r.status === 'grace')
      .sort((a, b) => a.index - b.index)[0];
    if (alreadyRunning) {
      return { roundId: alreadyRunning._id, opened: false }; // idempotent
    }
    const nextScheduled = rounds
      .filter((r) => r.status === 'scheduled')
      .sort((a, b) => a.index - b.index)[0];
    if (!nextScheduled) {
      return { roundId: null, opened: false };
    }

    const opened = await openRoundForTick(ctx, nextScheduled._id);
    return { roundId: nextScheduled._id, opened };
  },
});
