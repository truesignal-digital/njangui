import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { appLanguageValidator, pushPlatformValidator } from './schema';
import { getCurrentUserOrNull } from './utils/auth';

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
// Internal mutations — Clerk webhook sync (convex/http.ts)
// ============================================================================

/**
 * 🔒 linkGuard: a phone number is NEVER accepted from the webhook (or any
 * client/JWT input) — with the OTP possession-proof system removed there is
 * no verified writer of users.phone at all, and phone-keyed membership
 * grants are gone with it. Feature-phone members who later sign up are
 * attached by a treasurer/president re-adding them, never automatically.
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
      // Webhook raced a row created earlier (e.g. getOrCreateCurrentUser) —
      // still sync the Clerk-owned identifiers it carries.
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
 * 🔒 linkGuard: syncs name/avatar/username/email ONLY — the webhook phone
 * is ignored (T-12); nothing writes users.phone anymore.
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
    // forever (decision 6: immutability is the product).
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
    // whose JWT carried a phone claim would have self-linked memberships.
    // Nothing writes users.phone anymore.
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
