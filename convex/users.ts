import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
} from './_generated/server';
import { revokeAllForUser } from './devices';
import { appLanguageValidator, pushPlatformValidator } from './schema';
import { logActivityEvent } from './utils/activity';
import { getCurrentUserOrNull } from './utils/auth';
import { normalizePhone } from './utils/phone';

// ============================================================================
// Reusable return type validators
// ============================================================================

const currentUserValidator = v.object({
  _id: v.id('users'),
  _creationTime: v.number(),
  clerkId: v.string(),
  name: v.string(),
  username: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  language: appLanguageValidator,
  avatarUrl: v.optional(v.string()),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Link feature-phone memberships (no userId) to a freshly known user by
 * E.164 phone match (02 §a: "If that phone number later signs up via Clerk,
 * the account is linked to the existing Membership and its full history").
 *
 * 🔒 linkGuard: this grants a pre-existing membership + full ledger history
 * + payout position. Its ONLY caller is setVerifiedPhone, which requires a
 * freshly-consumed OTP possession proof — never a webhook phone, never a
 * JWT claim, never a client arg (threat review T-03/T-11/T-12).
 */
async function linkMembershipsByPhone(ctx: MutationCtx, userId: Id<'users'>, phone: string) {
  const matches = await ctx.db
    .query('memberships')
    .withIndex('by_phone', (q) => q.eq('phone', phone))
    .collect();

  for (const membership of matches) {
    if (membership.userId !== undefined) {
      continue;
    }
    /*
     * Never create a second membership for the same user in one group
     * (e.g. they joined by code before verifying their phone). Dupes
     * crash .unique() reads and double the group list; the unclaimed row
     * stays for the president to reconcile.
     */
    const alreadyMember = await ctx.db
      .query('memberships')
      .withIndex('by_group_and_user', (q) =>
        q.eq('groupId', membership.groupId).eq('userId', userId)
      )
      .first();
    if (alreadyMember) {
      console.log(
        `linkMembershipsByPhone: skipped ${membership._id} — user ${userId} already holds ${alreadyMember._id} in group ${membership.groupId}`
      );
      continue;
    }
    await ctx.db.patch(membership._id, { userId });
    await logActivityEvent(ctx, {
      groupId: membership.groupId,
      kind: 'member_linked',
      entityTable: 'memberships',
      entityId: membership._id,
      note: `${membership.displayName} a créé un compte — historique relié`,
    });
  }
}

/**
 * users.phone is unique (01 §3.1, mutation-enforced). Returns the phone if
 * it is free (or held by `selfId`), otherwise undefined — Clerk is the
 * identity authority, so a collision is logged and the phone dropped rather
 * than failing the sync.
 */
async function phoneIfAvailable(
  ctx: MutationCtx,
  phone: string | undefined,
  selfId?: Id<'users'>
): Promise<string | undefined> {
  if (!phone) {
    return undefined;
  }
  const normalized = normalizePhone(phone);
  const holder = await ctx.db
    .query('users')
    .withIndex('by_phone', (q) => q.eq('phone', normalized))
    .first();
  if (holder && holder._id !== selfId) {
    console.error(`Phone ${normalized} already held by user ${holder._id} — dropping from sync`);
    return undefined;
  }
  return normalized;
}

// ============================================================================
// Internal mutations — Clerk webhook sync (convex/http.ts)
// ============================================================================

/**
 * 🔒 linkGuard: the webhook phone is NOT possession-verified once OTP
 * delivery leaves Clerk — users are created phone-less here; only
 * setVerifiedPhone (fresh OTP proof) sets users.phone / links memberships.
 */
export const createUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (existingUser) {
      // Webhook raced a row created earlier (e.g. setVerifiedPhone) — still
      // sync the Clerk-owned identifiers it carries.
      await ctx.db.patch(existingUser._id, {
        ...(args.username !== undefined && {
          username: args.username.toLowerCase(),
        }),
        ...(args.email !== undefined && { email: args.email.toLowerCase() }),
      });
      return existingUser._id;
    }

    return await ctx.db.insert('users', {
      clerkId: args.clerkId,
      name: args.name || '',
      language: 'fr',
      avatarUrl: args.avatarUrl,
      ...(args.username !== undefined && {
        username: args.username.toLowerCase(),
      }),
      ...(args.email !== undefined && { email: args.email.toLowerCase() }),
    });
  },
});

/**
 * 🔒 linkGuard: syncs name/avatar ONLY — the webhook phone is ignored for
 * setting/linking (T-12); setVerifiedPhone owns the phone.
 */
export const updateUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.id('users')),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      console.log(`User with clerkId ${args.clerkId} not found for update`);
      return null;
    }

    await ctx.db.patch(user._id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.avatarUrl !== undefined && { avatarUrl: args.avatarUrl }),
      ...(args.username !== undefined && {
        username: args.username.toLowerCase(),
      }),
      ...(args.email !== undefined && { email: args.email.toLowerCase() }),
    });

    return user._id;
  },
});

// setVerifiedPhone accepts a consumed challenge only within this window —
// long enough for the verifyOtp action's Clerk round-trips, far too short
// to replay later.
const PHONE_PROOF_GRACE_MS = 60_000;

/**
 * 🔒 THE linkGuard chokepoint — the ONLY writer of users.phone and the ONLY
 * caller of linkMembershipsByPhone. Trusts nothing from the client: it
 * re-validates server-side that an otpChallenges row for this EXACT
 * normalized phone was consumed within the last seconds (the fresh
 * possession proof), then applies the uniqueness guard, sets the phone,
 * and fires the membership link. Sole invoker: internal.otp/verifyOtp.
 * Creates the users row when the Clerk webhook hasn't landed yet.
 */
// Flat result (non-strict app tsconfig — unions don't narrow). Expected
// user-facing refusals come back as reasons; an invariant breach (no fresh
// proof) still THROWS — that's a bug or an attack, never a UX state.
const setVerifiedPhoneResultValidator = v.object({
  ok: v.boolean(),
  userId: v.optional(v.id('users')),
  reason: v.optional(
    v.union(v.literal('collision'), v.literal('phone_change'))
  ),
});

export const setVerifiedPhone = internalMutation({
  args: {
    clerkId: v.string(),
    phone: v.string(),
    name: v.optional(v.string()), // seed for a webhook-race insert only
  },
  returns: setVerifiedPhoneResultValidator,
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);

    // Re-validate the possession proof — never a client-passed boolean.
    const challenges = await ctx.db
      .query('otpChallenges')
      .withIndex('by_phone_and_purpose', (q) => q.eq('phone', phone))
      .collect();
    const now = Date.now();
    const fresh = challenges.find(
      (c) =>
        c.consumedAt !== undefined &&
        now - c.consumedAt <= PHONE_PROOF_GRACE_MS &&
        (c.purpose === 'login' || c.purpose === 'phone_change')
    );
    if (!fresh) {
      throw new Error(
        'No fresh possession proof for this phone — refusing to set/link'
      );
    }

    let user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();
    if (!user) {
      const userId = await ctx.db.insert('users', {
        clerkId: args.clerkId,
        name: args.name ?? '',
        language: 'fr',
      });
      user = await ctx.db.get(userId);
    }
    if (!user) {
      throw new Error('User row could not be resolved');
    }

    if (user.phone === phone) {
      // Idempotent re-verify on the same device/phone — still (re)link any
      // memberships added by phone since the last login.
      await linkMembershipsByPhone(ctx, user._id, phone);
      return { ok: true, userId: user._id };
    }

    if (user.phone !== undefined) {
      // Phone-CHANGE is out of MVP scope (spec open gap): it must migrate
      // memberships.phone, revoke old-phone devices and emit the SIM-swap
      // audit event — refuse loudly rather than silently re-home identity.
      console.error('setVerifiedPhone refused: phone change unsupported');
      return { ok: false, reason: 'phone_change' as const };
    }

    const available = await phoneIfAvailable(ctx, phone, user._id);
    if (!available) {
      // Another ACCOUNT holds this verified phone. Possession was proven,
      // so this is the collision surface — refuse loudly rather than
      // silently re-home money (T-03).
      console.error('setVerifiedPhone refused: phone held by another account');
      return { ok: false, reason: 'collision' as const };
    }

    await ctx.db.patch(user._id, { phone });
    await linkMembershipsByPhone(ctx, user._id, phone);
    return { ok: true, userId: user._id };
  },
});

/**
 * Username PREFIX search for the add-member flow (product decision
 * 2026-07-02: suggestions while typing beat pure exact-match UX).
 * Members-only, ≥2 chars, capped at 5 — the index range keeps it one
 * cheap lookup, and the cap keeps directory scraping unattractive.
 */
export const searchByUsername = query({
  args: {
    prefix: v.string(),
    // When adding to a group, suggestions that are ALREADY members come back
    // flagged so the row can say "D\u00e9j\u00e0 membre" instead of failing on Add.
    groupId: v.optional(v.id('groups')),
  },
  returns: v.array(
    v.object({
      userId: v.id('users'),
      username: v.string(),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
      alreadyMember: v.optional(v.boolean()),
    })
  ),
  handler: async (ctx, args) => {
    const me = await getCurrentUserOrNull(ctx);
    if (!me) return [];
    const prefix = args.prefix.trim().toLowerCase();
    if (prefix.length < 2) return [];
    const rows = await ctx.db
      .query('users')
      .withIndex('by_username', (q) =>
        q.gte('username', prefix).lt('username', `${prefix}\uffff`)
      )
      .take(5);
    const cards = [];
    for (const u of rows) {
      if (u.isDeactivated || u.username === undefined) continue;
      let alreadyMember: boolean | undefined;
      if (args.groupId !== undefined) {
        const membership = await ctx.db
          .query('memberships')
          .withIndex('by_group_and_user', (q) =>
            q.eq('groupId', args.groupId!).eq('userId', u._id)
          )
          .unique();
        alreadyMember = membership !== null && membership.status !== 'rejected';
      }
      cards.push({
        userId: u._id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatarUrl,
        alreadyMember,
      });
    }
    return cards;
  },
});

/**
 * Phone → Clerk identity, resolved from OUR ledger. Clerk cannot hold
 * Cameroonian phone identifiers at all (`unsupported_country_code` on
 * +237), so post-cutover users.phone — written only by setVerifiedPhone —
 * is the phone authority, and Clerk just issues sessions for the clerkId
 * this returns. Deactivated users still resolve: the Clerk user is deleted
 * with the account, so a dead identity fails at ticket mint, loudly.
 */
export const getClerkIdByPhone = internalQuery({
  args: { phone: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_phone', (q) => q.eq('phone', normalizePhone(args.phone)))
      .unique();
    return user?.clerkId ?? null;
  },
});

export const deleteUserByClerkId = internalMutation({
  args: {
    clerkId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    // Soft delete only — memberships and ledger rows reference this user
    // forever (decision 6: immutability is the product). Devices are the
    // exception: every live credential dies with the account, else the
    // handset could deviceLogin straight back into the soft-deleted ledger.
    await revokeAllForUser(ctx, user._id);
    await ctx.db.patch(user._id, { isDeactivated: true });
    return null;
  },
});

// ============================================================================
// Public queries
// ============================================================================

export const current = query({
  args: {},
  returns: v.union(v.null(), currentUserValidator),
  handler: async (ctx) => {
    const result = await getCurrentUserOrNull(ctx);
    if (!result) {
      return null;
    }
    const { user } = result;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      clerkId: user.clerkId,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      language: user.language,
      avatarUrl: user.avatarUrl,
    };
  },
});

// ============================================================================
// Public mutations
// ============================================================================

/**
 * Webhook-race fallback (src/hooks/use-ensure-user.ts calls this once after
 * sign-in): create the user from JWT claims if the Clerk webhook hasn't
 * landed yet. Idempotent.
 */
export const getOrCreateCurrentUser = mutation({
  args: {},
  returns: v.union(v.null(), currentUserValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const clerkId = identity.subject;

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', clerkId))
      .unique();

    if (existingUser) {
      return {
        _id: existingUser._id,
        _creationTime: existingUser._creationTime,
        clerkId: existingUser.clerkId,
        name: existingUser.name,
        username: existingUser.username,
        email: existingUser.email,
        phone: existingUser.phone,
        language: existingUser.language,
        avatarUrl: existingUser.avatarUrl,
      };
    }

    // 🔒 linkGuard: identity.phoneNumber (a bare JWT claim) is NEVER read —
    // it was the most dangerous self-assertion path (T-11): any session
    // whose JWT carried a phone claim would self-link memberships. Only
    // setVerifiedPhone (fresh OTP proof) sets users.phone.
    const name =
      (typeof identity.name === 'string' && identity.name) ||
      [identity.givenName, identity.familyName].filter(Boolean).join(' ') ||
      '';
    const avatarUrl = typeof identity.pictureUrl === 'string' ? identity.pictureUrl : undefined;
    // Best-effort username/email from standard JWT claims; the svix webhook
    // remains the authoritative sync for both.
    const username =
      (typeof identity.preferredUsername === 'string' && identity.preferredUsername) ||
      (typeof identity.nickname === 'string' && identity.nickname) ||
      undefined;
    const email = typeof identity.email === 'string' ? identity.email : undefined;

    const userId = await ctx.db.insert('users', {
      clerkId,
      name,
      language: 'fr',
      avatarUrl,
      ...(username !== undefined && { username: username.toLowerCase() }),
      ...(email !== undefined && { email: email.toLowerCase() }),
    });

    const newUser = await ctx.db.get(userId);
    if (!newUser) {
      return null;
    }
    return {
      _id: newUser._id,
      _creationTime: newUser._creationTime,
      clerkId: newUser.clerkId,
      name: newUser.name,
      username: newUser.username,
      email: newUser.email,
      phone: newUser.phone,
      language: newUser.language,
      avatarUrl: newUser.avatarUrl,
    };
  },
});

/**
 * Onboarding (docs/03 B10 « Comment le groupe vous appelle-t-il ? »): set the
 * display name on the current user.
 */
export const updateMyName = mutation({
  args: {
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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

    const name = args.name.trim();
    if (!name) {
      throw new Error('Name is required');
    }

    await ctx.db.patch(user._id, { name });
    return null;
  },
});

/**
 * Register/refresh this device's Expo push token (05 M12; schema
 * users.pushTokens). Deduped by token; capped so an unbounded reinstall
 * loop can't grow the array forever (oldest dropped first).
 */
export const savePushToken = mutation({
  args: {
    token: v.string(),
    platform: pushPlatformValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await getCurrentUserOrNull(ctx);
    if (!result) {
      throw new Error('Not authenticated');
    }
    const { user } = result;
    const token = args.token.trim();
    if (!token) {
      throw new Error('token is required');
    }
    const now = Date.now();
    const others = (user.pushTokens ?? []).filter((t) => t.token !== token);
    const pushTokens = [
      ...others.slice(-4), // keep at most 5 device tokens per user
      { token, platform: args.platform, updatedAt: now },
    ];
    await ctx.db.patch(user._id, { pushTokens });
    return null;
  },
});

export const updateLanguage = mutation({
  args: {
    language: appLanguageValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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

    await ctx.db.patch(user._id, { language: args.language });
    return null;
  },
});
