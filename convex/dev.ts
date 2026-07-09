import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from './_generated/server';
import { performStartCycle } from './cycles';
import { generateUniqueInviteCode } from './groups';
import { openRoundForTick } from './rounds';
import { logActivityEvent } from './utils/activity';
import { getCurrentUser, requireRole } from './utils/auth';
import { isValidE164, normalizePhone } from './utils/phone';

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

// Test phones for the reserved 555-01XX block. Slot 0 is the DevAuthButton
// default (président); slots 1–2 are seeded onto the treasurer / first
// member memberships so signing in as them attaches those memberships —
// the two-sided claim→confirm handshake stays drivable with real
// identities and zero backend special-casing.
export const DEV_TEST_PHONES = {
  president: '+12015550100',
  treasurer: '+12015550101',
  member: '+12015550102',
} as const;

// ── Clerk Backend API helpers (dev harness only) ─────────────────────────

function clerkHeaders(): Record<string, string> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error('CLERK_SECRET_KEY not configured in Convex env');
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function clerkResolveUserByUsername(username: string): Promise<string | null> {
  const response = await fetch(
    `https://api.clerk.com/v1/users?username=${encodeURIComponent(username)}`,
    { headers: clerkHeaders() }
  );
  if (!response.ok) {
    throw new Error(`Clerk username lookup failed: ${response.status}`);
  }
  const users = (await response.json()) as { id: string }[];
  return users[0]?.id ?? null;
}

/**
 * Deterministic synthetic username per test phone — a retried create 422s
 * (username taken) and resolves to the same identity. The password is a
 * discarded 256-bit random: sessions only ever come from sign-in tickets.
 */
async function clerkCreateDevUser(username: string): Promise<string> {
  const password = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const response = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: clerkHeaders(),
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 422) {
    const existing = await clerkResolveUserByUsername(username);
    if (existing) return existing;
  }
  if (!response.ok) {
    throw new Error(`Clerk dev user create failed: ${response.status}`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

async function clerkMintTicket(clerkUserId: string): Promise<string> {
  const response = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders(),
    body: JSON.stringify({
      user_id: clerkUserId,
      expires_in_seconds: 120, // single-use, short-TTL
    }),
  });
  if (!response.ok) {
    throw new Error(`Clerk sign-in token mint failed: ${response.status}`);
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * DEV-ONLY user provisioning for the sim pills: ensure a users row for the
 * Clerk identity, stamp the test phone on it, and attach any unclaimed
 * seeded memberships carrying that phone. This is a HARNESS-ONLY stand-in
 * for the removed production phone-link path (linkMembershipsByPhone died
 * with the OTP possession proof) — it must never gain a public caller;
 * every entry point is behind assertDevSeedEnabled().
 */
export const devEnsureUserWithPhone = internalMutation({
  args: { clerkId: v.string(), phone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const phone = normalizePhone(args.phone);

    let user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();
    if (!user) {
      const userId = await ctx.db.insert('users', {
        clerkId: args.clerkId,
        name: '',
        language: 'fr',
      });
      user = await ctx.db.get(userId);
    }
    if (!user) {
      throw new Error('User row could not be resolved');
    }
    if (user.phone !== phone) {
      await ctx.db.patch(user._id, { phone });
    }

    // Attach seeded feature-phone memberships (dupe-safe: never a second
    // membership for the same user in one group).
    const matches = await ctx.db
      .query('memberships')
      .withIndex('by_phone', (q) => q.eq('phone', phone))
      .collect();
    for (const membership of matches) {
      if (membership.userId !== undefined) continue;
      const alreadyMember = await ctx.db
        .query('memberships')
        .withIndex('by_group_and_user', (q) =>
          q.eq('groupId', membership.groupId).eq('userId', user._id)
        )
        .first();
      if (alreadyMember) continue;
      await ctx.db.patch(membership._id, { userId: user._id });
    }
    return null;
  },
});

/**
 * One-tap sim sign-in for the DEV pills. User-facing auth is
 * username+password + Google SSO; the pills resolve/create a Clerk user
 * with a deterministic dev username, provision the Convex row (test phone +
 * seeded-membership attach, dev harness only), and mint a short-TTL Clerk
 * ticket. Gated by DEV_SEED_ENABLED — never enable on production.
 */
export const devLoginTicket = action({
  args: { phone: v.string() },
  returns: v.object({
    ok: v.boolean(),
    ticket: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const phone = normalizePhone(args.phone);
    if (!isValidE164(phone)) {
      throw new Error('Invalid phone');
    }
    const username = `phone_${phone.replace('+', '')}`;
    let clerkUserId = await clerkResolveUserByUsername(username);
    if (!clerkUserId) {
      clerkUserId = await clerkCreateDevUser(username);
    }
    await ctx.runMutation(internal.dev.devEnsureUserWithPhone, {
      clerkId: clerkUserId,
      phone,
    });
    const ticket = await clerkMintTicket(clerkUserId);
    return { ok: true, ticket };
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

const PILOT_SMARTPHONE_MEMBERS = [
  ['Awa Ndip', 'fr'],
  ['Mballa Manga', 'fr'],
  ['Ngu Tabi', 'fr'],
  ['Etonde Ze', 'fr'],
  ['Oben Arrey', 'en'],
  ['Sumelong Bih', 'en'],
  ['Achu Nformi', 'en'],
] as const;

const PILOT_FEATURE_PHONE_MEMBERS = [
  'Mama Ngozi',
  'Papa Simon',
  'Mami Therese',
  'Tata Julienne',
  'Pa Etienne',
] as const;

async function ensurePilotUser(
  ctx: MutationCtx,
  clerkId: string,
  name: string,
  language: 'fr' | 'en'
) {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', clerkId))
    .unique();
  if (existing) {
    if (!existing.name.trim()) {
      await ctx.db.patch(existing._id, { name });
    }
    return existing._id;
  }
  return await ctx.db.insert('users', { clerkId, name, language });
}

/**
 * Deterministic 15-person mock pilot fixture. Internal so tests can exercise
 * it without Clerk network calls; the public action below provisions the two
 * controllable Clerk identities, then delegates here.
 */
export const devSeedPilotData = internalMutation({
  args: {
    presidentClerkId: v.string(),
    treasurerClerkId: v.string(),
    memberClerkId: v.string(),
  },
  returns: v.object({
    groupId: v.id('groups'),
    cycleId: v.id('cycles'),
  }),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const now = Date.now();
    const presidentUserId = await ensurePilotUser(
      ctx,
      args.presidentClerkId,
      'Alice Mballa',
      'fr'
    );
    const treasurerUserId = await ensurePilotUser(
      ctx,
      args.treasurerClerkId,
      'Marie Ngono',
      'fr'
    );
    const memberUserId = await ensurePilotUser(
      ctx,
      args.memberClerkId,
      'Paul Nfor',
      'en'
    );
    const inviteCode = await generateUniqueInviteCode(ctx);
    const groupId = await ctx.db.insert('groups', {
      name: 'Njangi Solidarité',
      description: 'Groupe pilote simulé — 15 membres',
      city: 'Douala',
      schedule: 'monthly',
      contributionAmount: 10_000,
      targetMemberCount: 15,
      colorSeed: 36,
      graceDays: 2,
      finesEnabled: false,
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      inviteCode,
      status: 'setup',
      language: 'fr',
      createdByUserId: presidentUserId,
    });

    const rotationOrder: Id<'memberships'>[] = [];
    const addLinkedMembership = async (
      userId: typeof presidentUserId,
      displayName: string,
      role: 'president' | 'treasurer' | 'member',
      phone: string | undefined,
      offset: number
    ) => {
      const membershipId = await ctx.db.insert('memberships', {
        groupId,
        userId,
        ...(phone !== undefined && { phone }),
        displayName,
        role,
        status: 'active',
        joinedAt: now + offset,
      });
      rotationOrder.push(membershipId);
      return membershipId;
    };

    const presidentMembershipId = await addLinkedMembership(
      presidentUserId,
      'Alice Mballa',
      'president',
      DEV_TEST_PHONES.president,
      0
    );
    await addLinkedMembership(
      treasurerUserId,
      'Marie Ngono',
      'treasurer',
      DEV_TEST_PHONES.treasurer,
      1
    );
    await addLinkedMembership(
      memberUserId,
      'Paul Nfor',
      'member',
      DEV_TEST_PHONES.member,
      2
    );

    for (let i = 0; i < PILOT_SMARTPHONE_MEMBERS.length; i++) {
      const [name, language] = PILOT_SMARTPHONE_MEMBERS[i];
      const userId = await ensurePilotUser(
        ctx,
        `pilot-${args.presidentClerkId}-${i}`,
        name,
        language
      );
      await addLinkedMembership(userId, name, 'member', undefined, i + 3);
    }

    for (let i = 0; i < PILOT_FEATURE_PHONE_MEMBERS.length; i++) {
      const membershipId = await ctx.db.insert('memberships', {
        groupId,
        phone: `+23767710${String(100 + i).slice(-3)}`,
        displayName: PILOT_FEATURE_PHONE_MEMBERS[i],
        role: 'member',
        status: 'active',
        joinedAt: now + 10 + i,
      });
      rotationOrder.push(membershipId);
    }

    const startDate = new Date(now + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const cycleId = await ctx.db.insert('cycles', {
      groupId,
      index: 1,
      status: 'draft',
      rotationOrder,
      contributionAmount: 10_000,
      schedule: 'monthly',
      beneficiaryContributes: true,
      collectionMode: 'via_treasurer',
      graceDays: 2,
      startDate,
    });

    await logActivityEvent(ctx, {
      groupId,
      kind: 'group_created',
      entityTable: 'groups',
      entityId: groupId,
      actorMembershipId: presidentMembershipId,
      note: 'mock pilot fixture',
    });

    return { groupId, cycleId };
  },
});

/** Provision the three controllable Clerk identities, then seed the fixture. */
export const devSeedPilot = action({
  args: {},
  returns: v.object({
    groupId: v.id('groups'),
    cycleId: v.id('cycles'),
  }),
  handler: async (ctx): Promise<{
    groupId: Id<'groups'>;
    cycleId: Id<'cycles'>;
  }> => {
    assertDevSeedEnabled();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const treasurerClerkId =
      (await clerkResolveUserByUsername('phone_12015550101')) ??
      (await clerkCreateDevUser('phone_12015550101'));
    const memberClerkId =
      (await clerkResolveUserByUsername('phone_12015550102')) ??
      (await clerkCreateDevUser('phone_12015550102'));
    return await ctx.runMutation(internal.dev.devSeedPilotData, {
      presidentClerkId: identity.subject,
      treasurerClerkId,
      memberClerkId,
    });
  },
});

const pilotStepValidator = v.union(
  v.literal('open_next'),
  v.literal('to_grace'),
  v.literal('to_close'),
  v.literal('expire_claims')
);

const pilotRoundStateValidator = v.object({
  cycleId: v.union(v.id('cycles'), v.null()),
  roundId: v.union(v.id('rounds'), v.null()),
  roundIndex: v.union(v.number(), v.null()),
  roundStatus: v.union(
    v.literal('scheduled'),
    v.literal('open'),
    v.literal('grace'),
    v.literal('closed'),
    v.literal('payout'),
    v.literal('completed'),
    v.literal('skipped'),
    v.literal('cancelled'),
    v.null()
  ),
});

/** Prepare timestamps only; internal.crons.tick performs the real transitions. */
export const devPreparePilotStep = internalMutation({
  args: {
    groupId: v.id('groups'),
    step: pilotStepValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    await requireRole(ctx, args.groupId, ['president']);
    const cycle = await ctx.db
      .query('cycles')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', args.groupId).eq('status', 'active')
      )
      .first();
    if (!cycle) throw new Error('No active pilot cycle');
    const rounds = await ctx.db
      .query('rounds')
      .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
      .collect();
    const ordered = [...rounds].sort((a, b) => a.index - b.index);
    const now = Date.now();

    if (args.step === 'open_next') {
      if (ordered.some((round) => round.status === 'open' || round.status === 'grace')) {
        throw new Error('Finish the current open round before opening the next');
      }
      if (ordered.some((round) => round.status === 'closed' || round.status === 'payout')) {
        throw new Error('Complete the current payout before opening the next round');
      }
      const next = ordered.find((round) => round.status === 'scheduled');
      if (!next) throw new Error('No scheduled round remains');
      await ctx.db.patch(next._id, {
        scheduledOpenAt: now - 1,
        dueAt: now + 24 * 60 * 60 * 1000,
        graceEndAt: now + 3 * 24 * 60 * 60 * 1000,
      });
      return null;
    }

    if (args.step === 'expire_claims') {
      const claimed = await ctx.db
        .query('paymentRecords')
        .withIndex('by_group_and_state', (q) =>
          q.eq('groupId', args.groupId).eq('state', 'claimed')
        )
        .collect();
      for (const record of claimed) {
        await ctx.db.patch(record._id, {
          claimedAt: now - 8 * 24 * 60 * 60 * 1000,
        });
        if (record.roundId !== undefined && record.claimedBySide === 'payer') {
          const round = await ctx.db.get(record.roundId);
          if (round && round.dueAt > now) {
            await ctx.db.patch(round._id, { dueAt: now - 1 });
          }
        }
      }
      return null;
    }

    const current = ordered.find(
      (round) => round.status === 'open' || round.status === 'grace'
    );
    if (!current) throw new Error('No open or grace round');
    if (args.step === 'to_grace') {
      if (current.status !== 'open') throw new Error('Round is already in grace');
      await ctx.db.patch(current._id, {
        dueAt: now - 1,
        graceEndAt: now + 60 * 60 * 1000,
      });
      return null;
    }
    await ctx.db.patch(current._id, {
      dueAt: now - 2,
      graceEndAt: now - 1,
    });
    return null;
  },
});

export const devPilotRoundState = internalQuery({
  args: { groupId: v.id('groups') },
  returns: pilotRoundStateValidator,
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    const cycle = await ctx.db
      .query('cycles')
      .withIndex('by_group_and_status', (q) =>
        q.eq('groupId', args.groupId).eq('status', 'active')
      )
      .first();
    if (!cycle) {
      return {
        cycleId: null,
        roundId: null,
        roundIndex: null,
        roundStatus: null,
      };
    }
    const rounds = await ctx.db
      .query('rounds')
      .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
      .collect();
    const ordered = [...rounds].sort((a, b) => a.index - b.index);
    const current =
      ordered.find((round) =>
        ['open', 'grace', 'closed', 'payout'].includes(round.status)
      ) ??
      [...ordered]
        .reverse()
        .find((round) => round.status === 'completed' || round.status === 'cancelled');
    return {
      cycleId: cycle._id,
      roundId: current?._id ?? null,
      roundIndex: current?.index ?? null,
      roundStatus: current?.status ?? null,
    };
  },
});

/**
 * Compress calendar time for the mock pilot while routing every state change
 * through the production cron implementation.
 */
export const devAdvancePilotRound = action({
  args: {
    groupId: v.id('groups'),
    step: pilotStepValidator,
  },
  returns: pilotRoundStateValidator,
  handler: async (ctx, args) => {
    assertDevSeedEnabled();
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Not authenticated');
    await ctx.runMutation(internal.dev.devPreparePilotStep, args);
    await ctx.runMutation(internal.crons.tick, {});
    return await ctx.runQuery(internal.dev.devPilotRoundState, {
      groupId: args.groupId,
    });
  },
});

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
    // passes. Treasurer + first ordinary member carry dev test-phone
    // numbers: if that dev user already exists we attach their userId now;
    // otherwise their first dev pill sign-in attaches the membership
    // (devEnsureUserWithPhone). Everyone else stays feature-phone.
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
